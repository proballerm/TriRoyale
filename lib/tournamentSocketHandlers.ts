import { randomUUID } from "crypto";
import type { Server, Socket } from "socket.io";
import {
  correctAnswerText,
  getRankedTournamentQuestion,
  tournamentQuestionDifficulty,
} from "./triviaDifficulty";
import {
  bindDuelToLobby,
  bindPlayerToLobby,
  completeTournamentLobby,
  createTournamentLobby,
  getLatestTournamentCoordinator,
  getTournamentLobby,
  getTournamentLobbyForDuel,
  getTournamentLobbyForPlayer,
  type TournamentLobby,
} from "./tournamentLobbyRegistry";
import {
  DuelQuestion,
  TOURNAMENT_DUEL_QUESTION_TIME_SECONDS,
  TournamentDuelEngine,
} from "./tournamentDuelEngine";
import { archiveCompletedTournament } from "./tournamentPersistence";

const duelSessions = new Map<string, TournamentDuelEngine>();
const duelTimers = new Map<string, NodeJS.Timeout>();
const botTimers = new Map<string, NodeJS.Timeout[]>();
const duelStarting = new Set<string>();
const LOBBY_FILL_DURATION_MS = 6_000;
const LOBBY_FILL_TICK_MS = 250;

function sanitizeIdentity(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const sanitized = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return sanitized || null;
}

function playerRoom(lobbyId: string, playerId: string): string {
  return `tournament:${lobbyId}:player:${playerId}`;
}

function duelRoom(duelId: string): string {
  return `tournament-duel:${duelId}`;
}

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
    multiplier: engine.getQuestionMultiplier(),
    startTime: engine.getQuestionStartedAt() || Date.now(),
  };
}

async function createDuelQuestions(
  lobby: TournamentLobby,
  tournamentRound: number,
): Promise<DuelQuestion[]> {
  const questions: DuelQuestion[] = [];
  const duelFingerprints = new Set<string>();
  const duelCategories = new Set<string>();

  for (let index = 0; index < 3; index += 1) {
    const targetRank = tournamentQuestionDifficulty(tournamentRound, index);
    const generated = await getRankedTournamentQuestion({
      targetRank,
      excludedFingerprints: [
        ...lobby.usedQuestionFingerprints,
        ...duelFingerprints,
      ],
      excludedCategories: duelCategories,
    });

    if (!generated) {
      throw new Error(
        `The approved question bank does not have an unused difficulty-${targetRank} question. Build more ranked questions before starting this round.`,
      );
    }

    questions.push({
      id: randomUUID(),
      category: generated.category,
      question: generated.question,
      answers: generated.answers,
      correctAnswer: correctAnswerText(generated),
      explanation: generated.explanation,
      timeLimit: TOURNAMENT_DUEL_QUESTION_TIME_SECONDS,
    });
    duelFingerprints.add(generated.fingerprint);
    duelCategories.add(generated.category);
    lobby.usedQuestionFingerprints.add(generated.fingerprint);
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

function emitAnswerStatus(io: Server, engine: TournamentDuelEngine, playerId: string): void {
  const question = engine.getCurrentQuestion();
  io.to(duelRoom(engine.duelId)).emit("tournamentPlayerAnswered", {
    duelId: engine.duelId,
    questionId: question.id,
    playerId,
    answeredPlayers: engine.playerIds.filter((id) => engine.hasAnswered(id)),
  });
}

function scheduleBotAnswer(io: Server, engine: TournamentDuelEngine, lobby: TournamentLobby): void {
  clearBotTimers(engine.duelId);
  const timers: NodeJS.Timeout[] = [];
  const remainingMs = Math.max(0, engine.getQuestionDeadline() - Date.now());

  for (const playerId of engine.playerIds) {
    const player = lobby.coordinator.getPlayer(playerId);
    if (player?.kind !== "bot" || engine.hasAnswered(playerId)) continue;
    const question = engine.getCurrentQuestion();
    const responseMs = Math.min(
      remainingMs,
      900 + Math.floor(Math.random() * Math.max(1, Math.min(6_000, remainingMs))),
    );
    const difficultyPenalty = Math.min(0.18, Math.max(0, player.round - 1) * 0.018);
    const accuracy = Math.max(
      0.42,
      Math.min(0.80, 0.58 + player.wins * 0.02 - difficultyPenalty),
    );
    const correct = Math.random() < accuracy;
    const wrongAnswers = question.answers.filter((choice) => choice !== question.correctAnswer);
    const answer = correct
      ? question.correctAnswer
      : wrongAnswers[Math.floor(Math.random() * wrongAnswers.length)];

    const timer = setTimeout(() => {
      if (engine.isComplete() || engine.hasAnswered(playerId)) return;
      try {
        const result = engine.submitAnswer(playerId, question.id, answer, Date.now());
        if (!result.accepted) return;
        emitAnswerStatus(io, engine, playerId);
        emitScores(io, engine);
        if (engine.isQuestionComplete()) void finishQuestion(io, engine, lobby);
      } catch {
        // Question advanced before the bot timer fired.
      }
    }, responseMs);
    timers.push(timer);
  }

  botTimers.set(engine.duelId, timers);
}

function scheduleQuestionDeadline(io: Server, engine: TournamentDuelEngine, lobby: TournamentLobby): void {
  clearDuelTimer(engine.duelId);
  const remainingMs = Math.max(0, engine.getQuestionDeadline() - Date.now());
  duelTimers.set(
    engine.duelId,
    setTimeout(() => void finishQuestion(io, engine, lobby), remainingMs + 300),
  );
}

function startActiveQuestion(io: Server, engine: TournamentDuelEngine, lobby: TournamentLobby): void {
  clearDuelTimer(engine.duelId);
  clearBotTimers(engine.duelId);
  const question = engine.startQuestion(Date.now());
  io.to(duelRoom(engine.duelId)).emit("tournamentQuestion", publicQuestion(question, engine));
  scheduleBotAnswer(io, engine, lobby);
  scheduleQuestionDeadline(io, engine, lobby);
}

function resumeActiveQuestion(io: Server, engine: TournamentDuelEngine, lobby: TournamentLobby): void {
  if (!engine.getQuestionStartedAt()) {
    startActiveQuestion(io, engine, lobby);
    return;
  }
  if (engine.getQuestionDeadline() <= Date.now()) {
    void finishQuestion(io, engine, lobby);
    return;
  }
  scheduleBotAnswer(io, engine, lobby);
  scheduleQuestionDeadline(io, engine, lobby);
}

function emitMatchFound(io: Server, lobby: TournamentLobby, match: ReturnType<TournamentLobby["coordinator"]["getMatchForPlayer"]>): void {
  if (!match) return;
  const { duel, player, opponent, tournament } = match;
  bindDuelToLobby(duel.id, lobby.id);
  io.to(playerRoom(lobby.id, player.id)).emit("tournamentMatchFound", {
    lobbyId: lobby.id,
    duel,
    player,
    opponent,
    tournament,
  });
  if (opponent.kind === "human") {
    io.to(playerRoom(lobby.id, opponent.id)).emit("tournamentMatchFound", {
      lobbyId: lobby.id,
      duel,
      player: opponent,
      opponent: player,
      tournament,
    });
  }
}

async function finishQuestion(io: Server, engine: TournamentDuelEngine, lobby: TournamentLobby): Promise<void> {
  clearDuelTimer(engine.duelId);
  clearBotTimers(engine.duelId);
  if (engine.isComplete()) return;

  const question = engine.getCurrentQuestion();
  for (const playerId of engine.playerIds) {
    if (!engine.hasAnswered(playerId)) {
      engine.submitAnswer(playerId, question.id, "__TIMEOUT__", Date.now());
    }
  }

  io.to(duelRoom(engine.duelId)).emit("tournamentQuestionResult", {
    duelId: engine.duelId,
    questionId: question.id,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation,
    scores: engine.getScores(),
  });

  const nextQuestion = engine.advanceQuestion();
  if (nextQuestion) {
    setTimeout(() => startActiveQuestion(io, engine, lobby), 2_500);
    return;
  }

  const winnerId = engine.getWinnerId();
  const result = lobby.coordinator.completeMatch(engine.duelId, winnerId);
  const payload = {
    lobbyId: lobby.id,
    duel: result.duel,
    winner: result.winner,
    loser: result.loser,
    tournament: result.tournament,
    scores: engine.getScores(),
  };

  io.to(duelRoom(engine.duelId)).emit("tournamentDuelCompleted", payload);
  io.to(playerRoom(lobby.id, result.winner.id)).emit("tournamentMatchCompleted", payload);
  io.to(playerRoom(lobby.id, result.loser.id)).emit("tournamentMatchCompleted", payload);
  duelSessions.delete(engine.duelId);

  if (result.tournament.champion) {
    completeTournamentLobby(lobby.id);
    await archiveCompletedTournament(lobby.coordinator.exportState(), result.tournament).catch((error) => {
      console.error("[Tournament] Failed to archive completed tournament", error);
    });
    io.to(`tournament:${lobby.id}`).emit("tournamentChampion", {
      lobbyId: lobby.id,
      champion: result.tournament.champion,
      tournament: result.tournament,
    });
    return;
  }

  if (result.nextMatch) emitMatchFound(io, lobby, result.nextMatch);
}

function startLobbyFill(io: Server, lobby: TournamentLobby, playerId: string, displayName: string): void {
  const startedAt = Date.now();
  lobby.fillTimer = setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const ratio = Math.min(1, elapsed / LOBBY_FILL_DURATION_MS);
    const eased = 1 - Math.pow(1 - ratio, 2.4);
    lobby.visiblePlayers = Math.max(1, Math.min(lobby.targetPlayers, Math.floor(1 + eased * 999)));

    io.to(playerRoom(lobby.id, playerId)).emit("tournamentLobbyUpdate", {
      lobbyId: lobby.id,
      phase: ratio >= 1 ? "starting" : "waiting",
      joinedPlayers: lobby.visiblePlayers,
      targetPlayers: lobby.targetPlayers,
      estimatedSecondsRemaining: Math.max(0, Math.ceil((LOBBY_FILL_DURATION_MS - elapsed) / 1000)),
    });

    if (ratio < 1) return;
    if (lobby.fillTimer) clearInterval(lobby.fillTimer);
    lobby.fillTimer = null;
    lobby.phase = "active";

    const result = lobby.coordinator.join(playerId, displayName);
    io.to(playerRoom(lobby.id, playerId)).emit("tournamentJoined", {
      lobbyId: lobby.id,
      player: result.status === "matched" ? result.match.player : result.player,
      tournament: result.status === "matched" ? result.match.tournament : result.tournament,
    });

    if (result.status === "matched") emitMatchFound(io, lobby, result.match);
  }, LOBBY_FILL_TICK_MS);
}

export function registerTournamentSocketHandlers(io: Server, socket: Socket): void {
  socket.on("createTournamentLobby", ({ playerId, displayName }: Record<string, unknown>) => {
    const safePlayerId = sanitizeIdentity(playerId, 100);
    const safeDisplayName = sanitizeIdentity(displayName, 40);
    if (!safePlayerId || !safeDisplayName) {
      socket.emit("tournamentError", { message: "A valid player identity is required." });
      return;
    }

    try {
      const lobby = createTournamentLobby(safePlayerId);
      bindPlayerToLobby(safePlayerId, lobby.id);
      socket.data.tournamentPlayerId = safePlayerId;
      socket.data.tournamentLobbyId = lobby.id;
      socket.join(`tournament:${lobby.id}`);
      socket.join(playerRoom(lobby.id, safePlayerId));

      const initial = lobby.coordinator.join(safePlayerId, safeDisplayName);
      socket.emit("tournamentLobbyCreated", {
        lobbyId: lobby.id,
        phase: "waiting",
        joinedPlayers: 1,
        targetPlayers: lobby.targetPlayers,
        tournament: initial.status === "matched" ? initial.match.tournament : initial.tournament,
        player: initial.status === "matched" ? initial.match.player : initial.player,
      });
      startLobbyFill(io, lobby, safePlayerId, safeDisplayName);
    } catch (error) {
      socket.emit("tournamentError", {
        message: error instanceof Error ? error.message : "Unable to create tournament lobby.",
      });
    }
  });

  socket.on("joinTournament", ({ playerId, displayName, lobbyId }: Record<string, unknown>) => {
    const safePlayerId = sanitizeIdentity(playerId, 100);
    const safeDisplayName = sanitizeIdentity(displayName, 40);
    const safeLobbyId = sanitizeIdentity(lobbyId, 100);
    if (!safePlayerId || !safeDisplayName || !safeLobbyId) {
      socket.emit("tournamentError", { message: "Tournament lobby information is missing." });
      return;
    }

    const lobby = getTournamentLobby(safeLobbyId);
    if (!lobby) {
      socket.emit("tournamentError", { message: "That tournament lobby no longer exists." });
      return;
    }

    bindPlayerToLobby(safePlayerId, lobby.id);
    socket.data.tournamentPlayerId = safePlayerId;
    socket.data.tournamentLobbyId = lobby.id;
    socket.join(`tournament:${lobby.id}`);
    socket.join(playerRoom(lobby.id, safePlayerId));
    const result = lobby.coordinator.join(safePlayerId, safeDisplayName);
    socket.emit("tournamentJoined", {
      lobbyId: lobby.id,
      player: result.status === "matched" ? result.match.player : result.player,
      tournament: result.status === "matched" ? result.match.tournament : result.tournament,
    });
    if (result.status === "matched") emitMatchFound(io, lobby, result.match);
  });

  socket.on("getTournamentStatus", () => {
    const playerId = socket.data.tournamentPlayerId as string | undefined;
    const lobby = playerId ? getTournamentLobbyForPlayer(playerId) : null;
    if (!lobby || !playerId) {
      socket.emit("tournamentStatus", { lobbyId: null, tournament: null, player: null, match: null });
      return;
    }
    socket.emit("tournamentStatus", {
      lobbyId: lobby.id,
      tournament: lobby.coordinator.getSnapshot(),
      player: lobby.coordinator.getPlayer(playerId),
      match: lobby.coordinator.getMatchForPlayer(playerId),
    });
  });

  socket.on("startTournamentDuel", async ({ duelId }: Record<string, unknown>) => {
    const safeDuelId = sanitizeIdentity(duelId, 100);
    const playerId = socket.data.tournamentPlayerId as string | undefined;
    const lobby = safeDuelId ? getTournamentLobbyForDuel(safeDuelId) : null;
    if (!safeDuelId || !playerId || !lobby) {
      socket.emit("tournamentError", { message: "Unable to start this duel." });
      return;
    }

    const match = lobby.coordinator.getMatchForPlayer(playerId);
    if (!match || match.duel.id !== safeDuelId) {
      socket.emit("tournamentError", { message: "This duel is no longer active." });
      return;
    }

    socket.join(duelRoom(safeDuelId));
    const existing = duelSessions.get(safeDuelId);
    if (existing) {
      const opponentId = existing.playerIds.find((id) => id !== playerId);
      socket.emit("tournamentDuelReady", { lobbyId: lobby.id, duel: match.duel, player: match.player, opponent: match.opponent });
      socket.emit("tournamentDuelState", {
        duelId: safeDuelId,
        question: publicQuestion(existing.getCurrentQuestion(), existing),
        scores: existing.getScores(),
        answered: existing.hasAnswered(playerId),
        opponentAnswered: opponentId ? existing.hasAnswered(opponentId) : false,
      });
      resumeActiveQuestion(io, existing, lobby);
      return;
    }

    if (duelStarting.has(safeDuelId)) return;
    duelStarting.add(safeDuelId);
    try {
      const questions = await createDuelQuestions(lobby, match.duel.round);
      const engine = new TournamentDuelEngine(
        safeDuelId,
        [match.duel.playerOneId, match.duel.playerTwoId],
        questions,
      );
      duelSessions.set(safeDuelId, engine);
      io.to(duelRoom(safeDuelId)).emit("tournamentDuelReady", {
        lobbyId: lobby.id,
        duel: match.duel,
        player: match.player,
        opponent: match.opponent,
      });
      startActiveQuestion(io, engine, lobby);
    } catch (error) {
      socket.emit("tournamentError", {
        message: error instanceof Error ? error.message : "Unable to prepare duel questions.",
      });
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
      socket.emit("tournamentAnswerAccepted", {
        duelId: safeDuelId,
        questionId: safeQuestionId,
        accepted: result.accepted,
        points: result.points,
        multiplier: result.multiplier,
      });
      if (result.accepted) emitAnswerStatus(io, engine, playerId);
      emitScores(io, engine);
      const lobby = getTournamentLobbyForDuel(safeDuelId);
      if (lobby && engine.isQuestionComplete()) void finishQuestion(io, engine, lobby);
    } catch (error) {
      socket.emit("tournamentError", {
        message: error instanceof Error ? error.message : "Answer could not be submitted.",
      });
    }
  });
}

export function getTournamentCoordinator() {
  return getLatestTournamentCoordinator();
}
