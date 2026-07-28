import { randomUUID } from "crypto";
import type { Server, Socket } from "socket.io";
import { generateTriviaQuestion } from "./triviaGenerator";
import { TournamentCoordinator } from "./tournamentCoordinator";
import {
  DuelQuestion,
  TOURNAMENT_DUEL_QUESTION_TIME_SECONDS,
  TournamentDuelEngine,
} from "./tournamentDuelEngine";
import {
  archiveCompletedTournament,
  clearActiveDuelSessions,
  deleteActiveDuelSession,
  loadActiveDuelSessions,
  loadActiveTournament,
  saveActiveDuelSession,
  saveActiveTournament,
} from "./tournamentPersistence";

const coordinator = new TournamentCoordinator();
const duelSessions = new Map<string, TournamentDuelEngine>();
const duelTimers = new Map<string, NodeJS.Timeout>();
const botTimers = new Map<string, NodeJS.Timeout[]>();
const duelStarting = new Set<string>();
let persistenceWrite = Promise.resolve();

const persistenceReady = loadActiveTournament()
  .then(async (state) => {
    if (!state) return;
    coordinator.restore(state);
    const sessions = await loadActiveDuelSessions(state.tournamentId);
    for (const sessionState of sessions) {
      const match = coordinator.getMatchForPlayer(sessionState.playerIds[0]);
      if (match?.duel.id === sessionState.duelId && !sessionState.completed) {
        duelSessions.set(sessionState.duelId, TournamentDuelEngine.restore(sessionState));
      }
    }
    console.log(`[Tournament] Restored ${state.tournamentId} and ${duelSessions.size} live duel session(s)`);
  })
  .catch((error) => console.error("[Tournament] Failed to restore persisted state", error));

function queuePersistence(): Promise<void> {
  const state = coordinator.exportState();
  persistenceWrite = persistenceWrite
    .catch(() => undefined)
    .then(() => saveActiveTournament(state))
    .catch((error) => console.error("[Tournament] Failed to persist state", error));
  return persistenceWrite;
}

function queueDuelPersistence(engine: TournamentDuelEngine): Promise<void> {
  const tournamentId = coordinator.getSnapshot().id;
  const state = engine.exportState();
  persistenceWrite = persistenceWrite
    .catch(() => undefined)
    .then(() => saveActiveDuelSession(tournamentId, state))
    .catch((error) => console.error("[Tournament] Failed to persist duel session", error));
  return persistenceWrite;
}

function sanitizeIdentity(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const sanitized = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return sanitized || null;
}

function playerRoom(playerId: string): string { return `tournament-player:${playerId}`; }
function duelRoom(duelId: string): string { return `tournament-duel:${duelId}`; }

function publicQuestion(question: DuelQuestion, engine: TournamentDuelEngine) {
  return {
    duelId: engine.duelId,
    questionId: question.id,
    category: question.category,
    question: question.question,
    answers: question.answers,
    timeLimit: question.timeLimit,
    questionNumber: engine.getQuestionNumber(),
    questionCount: engine.questions.length,
    startTime: engine.getQuestionStartedAt() || Date.now(),
  };
}

async function createDuelQuestions(): Promise<DuelQuestion[]> {
  const categories = ["Sports", "Science", "Movies", "History", "Geography", "Music"];
  const questions: DuelQuestion[] = [];
  for (let index = 0; index < 3; index += 1) {
    const category = categories[Math.floor(Math.random() * categories.length)];
    const generated = await generateTriviaQuestion(category);
    const correctIndex = ["A", "B", "C", "D"].indexOf(generated.correct);
    if (correctIndex < 0 || !generated.answers[correctIndex]) throw new Error("Trivia generator returned an invalid correct answer");
    questions.push({
      id: randomUUID(),
      category,
      question: generated.question,
      answers: generated.answers,
      correctAnswer: generated.answers[correctIndex],
      explanation: generated.explanation,
      timeLimit: TOURNAMENT_DUEL_QUESTION_TIME_SECONDS,
    });
  }
  return questions;
}

function clearDuelTimer(duelId: string): void {
  const timer = duelTimers.get(duelId);
  if (timer) clearTimeout(timer);
  duelTimers.delete(duelId);
}

function clearBotTimers(duelId: string): void {
  for (const timer of botTimers.get(duelId) ?? []) clearTimeout(timer);
  botTimers.delete(duelId);
}

function emitScores(io: Server, engine: TournamentDuelEngine): void {
  io.to(duelRoom(engine.duelId)).emit("tournamentScoreUpdate", {
    duelId: engine.duelId,
    scores: engine.getScores(),
  });
}

function scheduleBotAnswer(io: Server, engine: TournamentDuelEngine): void {
  clearBotTimers(engine.duelId);
  const timers: NodeJS.Timeout[] = [];
  const remainingMs = Math.max(0, engine.getQuestionDeadline() - Date.now());
  for (const playerId of engine.playerIds) {
    const player = coordinator.getPlayer(playerId);
    if (player?.kind !== "bot" || engine.hasAnswered(playerId)) continue;
    const question = engine.getCurrentQuestion();
    const responseMs = Math.min(remainingMs, 500 + Math.floor(Math.random() * Math.max(1, Math.min(7_000, remainingMs))));
    const correct = Math.random() < 0.62;
    const wrongAnswers = question.answers.filter((choice) => choice !== question.correctAnswer);
    const answer = correct ? question.correctAnswer : wrongAnswers[Math.floor(Math.random() * wrongAnswers.length)];
    const timer = setTimeout(() => {
      if (engine.isComplete() || engine.hasAnswered(playerId)) return;
      try {
        engine.submitAnswer(playerId, question.id, answer, Date.now());
        void queueDuelPersistence(engine);
        emitScores(io, engine);
        if (engine.isQuestionComplete()) void finishQuestion(io, engine);
      } catch {
        // The question may have advanced while this timer was pending.
      }
    }, responseMs);
    timers.push(timer);
  }
  botTimers.set(engine.duelId, timers);
}

function scheduleQuestionDeadline(io: Server, engine: TournamentDuelEngine): void {
  clearDuelTimer(engine.duelId);
  const remainingMs = Math.max(0, engine.getQuestionDeadline() - Date.now());
  duelTimers.set(engine.duelId, setTimeout(() => void finishQuestion(io, engine), remainingMs + 300));
}

function startActiveQuestion(io: Server, engine: TournamentDuelEngine): void {
  clearDuelTimer(engine.duelId);
  clearBotTimers(engine.duelId);
  const startedAt = Date.now();
  const question = engine.startQuestion(startedAt);
  void queueDuelPersistence(engine);
  io.to(duelRoom(engine.duelId)).emit("tournamentQuestion", publicQuestion(question, engine));
  scheduleBotAnswer(io, engine);
  scheduleQuestionDeadline(io, engine);
}

function resumeActiveQuestion(io: Server, engine: TournamentDuelEngine): void {
  if (!engine.getQuestionStartedAt()) {
    startActiveQuestion(io, engine);
    return;
  }
  if (engine.getQuestionDeadline() <= Date.now()) {
    void finishQuestion(io, engine);
    return;
  }
  scheduleBotAnswer(io, engine);
  scheduleQuestionDeadline(io, engine);
}

async function finishQuestion(io: Server, engine: TournamentDuelEngine): Promise<void> {
  clearDuelTimer(engine.duelId);
  clearBotTimers(engine.duelId);
  if (engine.isComplete()) return;
  const question = engine.getCurrentQuestion();
  for (const playerId of engine.playerIds) {
    if (!engine.hasAnswered(playerId)) engine.submitAnswer(playerId, question.id, "__TIMEOUT__", Date.now());
  }
  io.to(duelRoom(engine.duelId)).emit("tournamentQuestionResult", {
    duelId: engine.duelId,
    questionId: question.id,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation,
    scores: engine.getScores(),
  });

  const nextQuestion = engine.advanceQuestion();
  await queueDuelPersistence(engine);
  if (nextQuestion) {
    setTimeout(() => startActiveQuestion(io, engine), 2_500);
    return;
  }

  const tournamentId = coordinator.getSnapshot().id;
  const winnerId = engine.getWinnerId();
  const result = coordinator.completeMatch(engine.duelId, winnerId);
  const payload = {
    duel: result.duel,
    winner: result.winner,
    loser: result.loser,
    tournament: result.tournament,
    scores: engine.getScores(),
  };
  io.to(duelRoom(engine.duelId)).emit("tournamentDuelCompleted", payload);
  io.to(playerRoom(result.winner.id)).emit("tournamentMatchCompleted", payload);
  io.to(playerRoom(result.loser.id)).emit("tournamentMatchCompleted", payload);
  duelSessions.delete(engine.duelId);
  await deleteActiveDuelSession(tournamentId, engine.duelId).catch((error) => {
    console.error("[Tournament] Failed to delete completed duel session", error);
  });

  if (result.tournament.champion) {
    const completedState = coordinator.exportState();
    try {
      await archiveCompletedTournament(completedState, result.tournament);
      await clearActiveDuelSessions(tournamentId);
      coordinator.reset();
      await queuePersistence();
      io.emit("tournamentReset", {
        tournament: coordinator.getSnapshot(),
        previousChampion: result.tournament.champion,
      });
    } catch (error) {
      console.error("[Tournament] Failed to archive completed tournament", error);
      await queuePersistence();
    }
    return;
  }

  await queuePersistence();
  if (result.nextMatch) {
    const { duel, player, opponent, tournament } = result.nextMatch;
    io.to(playerRoom(player.id)).emit("tournamentMatchFound", { duel, player, opponent, tournament });
    if (opponent.kind === "human") {
      io.to(playerRoom(opponent.id)).emit("tournamentMatchFound", {
        duel,
        player: opponent,
        opponent: player,
        tournament,
      });
    }
  }
}

export function registerTournamentSocketHandlers(io: Server, socket: Socket): void {
  socket.on("joinTournament", async ({ playerId, displayName }: Record<string, unknown>) => {
    await persistenceReady;
    const safePlayerId = sanitizeIdentity(playerId, 100);
    const safeDisplayName = sanitizeIdentity(displayName, 40);
    if (!safePlayerId || !safeDisplayName) {
      socket.emit("tournamentError", { message: "A valid player identity and display name are required." });
      return;
    }
    try {
      const result = coordinator.join(safePlayerId, safeDisplayName);
      socket.data.tournamentPlayerId = safePlayerId;
      socket.join(playerRoom(safePlayerId));
      await queuePersistence();
      socket.emit("tournamentJoined", {
        player: result.status === "matched" ? result.match.player : result.player,
        tournament: result.status === "matched" ? result.match.tournament : result.tournament,
      });
      if (result.status === "matched") {
        const { duel, player, opponent, tournament } = result.match;
        socket.emit("tournamentMatchFound", { duel, player, opponent, tournament });
        if (opponent.kind === "human") {
          io.to(playerRoom(opponent.id)).emit("tournamentMatchFound", {
            duel,
            player: opponent,
            opponent: player,
            tournament,
          });
        }
      }
    } catch (error) {
      socket.emit("tournamentError", { message: error instanceof Error ? error.message : "Unable to join tournament." });
    }
  });

  socket.on("getTournamentStatus", async () => {
    await persistenceReady;
    const playerId = socket.data.tournamentPlayerId as string | undefined;
    socket.emit("tournamentStatus", {
      tournament: coordinator.getSnapshot(),
      player: playerId ? coordinator.getPlayer(playerId) : null,
      match: playerId ? coordinator.getMatchForPlayer(playerId) : null,
    });
  });

  socket.on("startTournamentDuel", async ({ duelId }: Record<string, unknown>) => {
    await persistenceReady;
    const safeDuelId = sanitizeIdentity(duelId, 100);
    const playerId = socket.data.tournamentPlayerId as string | undefined;
    if (!safeDuelId || !playerId) {
      socket.emit("tournamentError", { message: "Unable to start this duel." });
      return;
    }
    const match = coordinator.getMatchForPlayer(playerId);
    if (!match || match.duel.id !== safeDuelId) {
      socket.emit("tournamentError", { message: "This duel is no longer active." });
      return;
    }
    socket.join(duelRoom(safeDuelId));
    const existing = duelSessions.get(safeDuelId);
    if (existing) {
      socket.emit("tournamentDuelReady", { duel: match.duel, player: match.player, opponent: match.opponent });
      socket.emit("tournamentDuelState", {
        duelId: safeDuelId,
        question: publicQuestion(existing.getCurrentQuestion(), existing),
        scores: existing.getScores(),
        answered: existing.hasAnswered(playerId),
      });
      resumeActiveQuestion(io, existing);
      return;
    }
    if (duelStarting.has(safeDuelId)) return;
    duelStarting.add(safeDuelId);
    try {
      const questions = await createDuelQuestions();
      const engine = new TournamentDuelEngine(safeDuelId, [match.duel.playerOneId, match.duel.playerTwoId], questions);
      duelSessions.set(safeDuelId, engine);
      io.to(duelRoom(safeDuelId)).emit("tournamentDuelReady", {
        duel: match.duel,
        player: match.player,
        opponent: match.opponent,
      });
      startActiveQuestion(io, engine);
    } catch (error) {
      socket.emit("tournamentError", { message: error instanceof Error ? error.message : "Unable to prepare duel questions." });
    } finally {
      duelStarting.delete(safeDuelId);
    }
  });

  socket.on("submitTournamentAnswer", async ({ duelId, questionId, answer }: Record<string, unknown>) => {
    const safeDuelId = sanitizeIdentity(duelId, 100);
    const safeQuestionId = sanitizeIdentity(questionId, 100);
    const safeAnswer = sanitizeIdentity(answer, 100);
    const playerId = socket.data.tournamentPlayerId as string | undefined;
    if (!safeDuelId || !safeQuestionId || !safeAnswer || !playerId) return;
    const engine = duelSessions.get(safeDuelId);
    if (!engine) {
      socket.emit("tournamentError", { message: "Duel session not found." });
      return;
    }
    try {
      const result = engine.submitAnswer(playerId, safeQuestionId, safeAnswer, Date.now());
      await queueDuelPersistence(engine);
      socket.emit("tournamentAnswerAccepted", {
        duelId: safeDuelId,
        questionId: safeQuestionId,
        accepted: result.accepted,
        points: result.points,
      });
      emitScores(io, engine);
      if (engine.isQuestionComplete()) void finishQuestion(io, engine);
    } catch (error) {
      socket.emit("tournamentError", { message: error instanceof Error ? error.message : "Answer could not be submitted." });
    }
  });
}

export function getTournamentCoordinator(): TournamentCoordinator { return coordinator; }
