import express from "express";
import { createServer } from "http";
import { randomUUID } from "crypto";
import { Server, Socket } from "socket.io";
import next from "next";
import "dotenv/config";
import { launchBots } from "./lib/botManager";
import { recordWin } from "./lib/recordWin";
import { generateTriviaQuestion } from "./lib/triviaGenerator";

const dev = process.env.NODE_ENV !== "production";
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

const lobbies: Record<string, string[]> = {};
const hosts: Record<string, string | null> = {};
const currentQuestions: Record<string, ActiveQuestion | null> = {};
const gameStartedFlags: Record<string, boolean> = {};
const botsLaunchedFlags: Record<string, boolean> = {};
const answerMaps: Record<string, Map<string, string>> = {};
const eliminatedPlayers: Record<string, Set<string>> = {};
const roundTimers: Record<string, NodeJS.Timeout | undefined> = {};
const intermissionTimers: Record<string, NodeJS.Timeout | undefined> = {};
const pendingDisconnects: Record<string, Map<string, NodeJS.Timeout>> = {};
const answerRateLimits = new Map<string, { windowStart: number; count: number }>();

const INTERMISSION_MS = 5000;
const QUESTION_TIME_SECONDS = 15;
const RECONNECT_GRACE_MS = 20_000;
const ANSWER_RATE_LIMIT = 8;
const VALID_CATEGORIES = new Set([
  "Battle Royale",
  "Sports",
  "Science",
  "Movies",
  "History",
  "Geography",
  "Music",
]);

const metrics = {
  startedAt: Date.now(),
  totalConnections: 0,
  reconnects: 0,
  matchesStarted: 0,
  questionsGenerated: 0,
  questionGenerationMs: 0,
  answersAccepted: 0,
  answersRejected: 0,
};

type GeneratedQuestion = Awaited<ReturnType<typeof generateTriviaQuestion>>;

type ActiveQuestion = GeneratedQuestion & {
  id: string;
  category: string;
  matchId: string;
  timeLimit: number;
  startTime: number;
  deadline: number;
};

function isBot(username: string): boolean {
  return username.startsWith("🤖");
}

function sanitizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim().slice(0, 40);
  return username || null;
}

function getPublicQuestion(question: ActiveQuestion) {
  return {
    questionId: question.id,
    category: question.category,
    matchId: question.matchId,
    question: question.question,
    answers: question.answers,
    difficulty: question.difficulty,
    timeLimit: question.timeLimit,
    startTime: question.startTime,
  };
}

function activeMatchCount(): number {
  return Object.values(gameStartedFlags).filter(Boolean).length;
}

function activePlayerCount(): number {
  return Object.values(lobbies).reduce((total, players) => total + players.length, 0);
}

function clearMatchTimers(matchId: string) {
  if (roundTimers[matchId]) clearTimeout(roundTimers[matchId]);
  if (intermissionTimers[matchId]) clearTimeout(intermissionTimers[matchId]);
  delete roundTimers[matchId];
  delete intermissionTimers[matchId];
}

function clearDisconnectTimer(matchId: string, username: string): boolean {
  const timer = pendingDisconnects[matchId]?.get(username);
  if (!timer) return false;
  clearTimeout(timer);
  pendingDisconnects[matchId].delete(username);
  return true;
}

function resetMatch(matchId: string) {
  clearMatchTimers(matchId);
  for (const timer of pendingDisconnects[matchId]?.values() || []) clearTimeout(timer);
  delete pendingDisconnects[matchId];
  gameStartedFlags[matchId] = false;
  currentQuestions[matchId] = null;
  lobbies[matchId] = [];
  hosts[matchId] = null;
  botsLaunchedFlags[matchId] = false;
  answerMaps[matchId] = new Map();
  eliminatedPlayers[matchId] = new Set();
}

function isAnswerRateLimited(socketId: string): boolean {
  const now = Date.now();
  const entry = answerRateLimits.get(socketId);
  if (!entry || now - entry.windowStart >= 1000) {
    answerRateLimits.set(socketId, { windowStart: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > ANSWER_RATE_LIMIT;
}

async function emitQuestionToBots(io: Server, matchId: string, question: ActiveQuestion) {
  const sockets = await io.in(matchId).fetchSockets();
  for (const playerSocket of sockets) {
    if (isBot(String(playerSocket.data.username || ""))) {
      playerSocket.emit("botQuestion", {
        ...getPublicQuestion(question),
        correct: question.correct,
      });
    }
  }
}

async function startRound(io: Server, matchId: string, category: string) {
  if (!gameStartedFlags[matchId]) return;

  const actualCategory =
    category === "Battle Royale"
      ? ["Sports", "Science", "Movies", "History", "Geography", "Music"][
          Math.floor(Math.random() * 6)
        ]
      : category;

  let generated: GeneratedQuestion;
  const generationStartedAt = Date.now();
  try {
    generated = await generateTriviaQuestion(actualCategory);
    metrics.questionsGenerated += 1;
    metrics.questionGenerationMs += Date.now() - generationStartedAt;
  } catch (error) {
    console.error(`[Match ${matchId}] Failed to load question`, error);
    io.to(matchId).emit("gameError", {
      message: "A new question could not be loaded. Please start a new match.",
    });
    resetMatch(matchId);
    return;
  }

  const startTime = Date.now();
  const question: ActiveQuestion = {
    ...generated,
    id: randomUUID(),
    category: actualCategory,
    matchId,
    timeLimit: QUESTION_TIME_SECONDS,
    startTime,
    deadline: startTime + QUESTION_TIME_SECONDS * 1000,
  };

  currentQuestions[matchId] = question;
  answerMaps[matchId] = new Map();

  io.to(matchId).emit("newQuestion", getPublicQuestion(question));
  await emitQuestionToBots(io, matchId, question);

  roundTimers[matchId] = setTimeout(async () => {
    const activeQuestion = currentQuestions[matchId];
    if (!activeQuestion || !gameStartedFlags[matchId]) return;

    const correctIndex = ["A", "B", "C", "D"].indexOf(activeQuestion.correct);
    const correctAnswer = activeQuestion.answers[correctIndex];
    const answeredUsers = answerMaps[matchId] || new Map();
    const players = lobbies[matchId] || [];
    const eliminated: string[] = [];
    const survivors: string[] = [];
    const sockets = await io.in(matchId).fetchSockets();

    for (const player of players) {
      const answer = answeredUsers.get(player);
      if (
        answer &&
        answer.trim().toLowerCase() === correctAnswer.trim().toLowerCase()
      ) {
        survivors.push(player);
        continue;
      }

      eliminated.push(player);
      eliminatedPlayers[matchId] ??= new Set();
      eliminatedPlayers[matchId].add(player);

      const playerSocket = sockets.find(
        (candidate) => candidate.data.username === player,
      );
      if (playerSocket) {
        playerSocket.emit("eliminated", { username: player });
        playerSocket.leave(matchId);
      }
    }

    lobbies[matchId] = survivors;
    io.to(matchId).emit("roundResult", {
      correctAnswer,
      explanation: activeQuestion.explanation,
      eliminated,
      survivors,
    });

    intermissionTimers[matchId] = setTimeout(async () => {
      if (survivors.length === 1) {
        const winner = survivors[0];
        io.to(matchId).emit("gameOver", { winner });

        if (!isBot(winner)) await recordWin(winner, category, io);
      } else if (survivors.length === 0) {
        io.to(matchId).emit("gameOver", { winner: null });
      } else {
        io.to(matchId).emit("playersRemaining", { count: survivors.length });
        await startRound(io, matchId, category);
        return;
      }

      resetMatch(matchId);
    }, INTERMISSION_MS);
  }, QUESTION_TIME_SECONDS * 1000);
}

nextApp.prepare().then(() => {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin: process.env.NODE_ENV === "production" ? process.env.APP_URL : "*",
      methods: ["GET", "POST"],
    },
  });

  app.get("/api/new-match", (_req, res) => {
    res.json({ matchId: randomUUID() });
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      uptimeSeconds: Math.floor((Date.now() - metrics.startedAt) / 1000),
      activeConnections: io.engine.clientsCount,
      activeMatches: activeMatchCount(),
      activePlayers: activePlayerCount(),
    });
  });

  app.get("/api/metrics", (_req, res) => {
    res.json({
      ...metrics,
      uptimeSeconds: Math.floor((Date.now() - metrics.startedAt) / 1000),
      activeConnections: io.engine.clientsCount,
      activeMatches: activeMatchCount(),
      activePlayers: activePlayerCount(),
      averageQuestionGenerationMs:
        metrics.questionsGenerated > 0
          ? Math.round(metrics.questionGenerationMs / metrics.questionsGenerated)
          : 0,
    });
  });

  io.on("connection", (socket: Socket) => {
    metrics.totalConnections += 1;

    const joinRoom = async ({ username, category, matchId }: Record<string, unknown>) => {
      const safeUsername = sanitizeUsername(username);
      if (!safeUsername || typeof matchId !== "string" || !matchId.trim()) return;
      if (!VALID_CATEGORIES.has(String(category))) {
        socket.emit("gameError", { message: "Invalid trivia category." });
        return;
      }

      const roomId = matchId.trim().slice(0, 100);
      const wasReconnecting = clearDisconnectTimer(roomId, safeUsername);
      if (wasReconnecting) metrics.reconnects += 1;

      if (gameStartedFlags[roomId] && !lobbies[roomId]?.includes(safeUsername)) {
        socket.emit("gameError", { message: "This match has already started." });
        return;
      }

      lobbies[roomId] ??= [];
      eliminatedPlayers[roomId] ??= new Set();
      pendingDisconnects[roomId] ??= new Map();

      if (!lobbies[roomId].includes(safeUsername)) lobbies[roomId].push(safeUsername);
      if (!hosts[roomId] && !isBot(safeUsername)) hosts[roomId] = safeUsername;

      socket.join(roomId);
      socket.data.username = safeUsername;
      socket.data.category = String(category);
      socket.data.matchId = roomId;

      if (!botsLaunchedFlags[roomId] && !isBot(safeUsername)) {
        botsLaunchedFlags[roomId] = true;
        launchBots(io, roomId, String(category)).catch((error) => {
          console.error(`[Match ${roomId}] Bot launch failed`, error);
          botsLaunchedFlags[roomId] = false;
        });
      }

      io.to(roomId).emit("lobbyUpdate", {
        category,
        players: lobbies[roomId],
        host: hosts[roomId],
        matchId: roomId,
      });

      const question = currentQuestions[roomId];
      socket.emit("gameStatus", {
        matchId: roomId,
        category,
        started: gameStartedFlags[roomId] || false,
        question: question ? getPublicQuestion(question) : null,
        eliminated: eliminatedPlayers[roomId]?.has(safeUsername) ? [safeUsername] : [],
        reconnected: wasReconnecting,
      });
    };

    socket.on("joinLobby", joinRoom);
    socket.on("resumeMatch", joinRoom);

    socket.on("startGame", async ({ category, matchId }) => {
      const roomId = socket.data.matchId;
      const username = socket.data.username;

      if (!roomId || roomId !== matchId || !username) return;
      if (!VALID_CATEGORIES.has(category)) return;
      if (hosts[roomId] !== username) {
        socket.emit("gameError", { message: "Only the lobby host can start the match." });
        return;
      }
      if (gameStartedFlags[roomId]) return;
      if ((lobbies[roomId]?.length || 0) < 2) {
        socket.emit("gameError", { message: "At least two players are required." });
        return;
      }

      gameStartedFlags[roomId] = true;
      metrics.matchesStarted += 1;
      io.to(roomId).emit("startGame", { category, matchId: roomId });
      await startRound(io, roomId, category);
    });

    socket.on("answer", ({ answer, questionId }) => {
      const username = socket.data.username;
      const matchId = socket.data.matchId;
      const question = matchId ? currentQuestions[matchId] : null;

      const invalid =
        !username ||
        !matchId ||
        typeof answer !== "string" ||
        typeof questionId !== "string" ||
        !question ||
        question.id !== questionId ||
        Date.now() > question.deadline + 250 ||
        !answerMaps[matchId] ||
        eliminatedPlayers[matchId]?.has(username) ||
        !lobbies[matchId]?.includes(username) ||
        isAnswerRateLimited(socket.id);

      if (invalid) {
        metrics.answersRejected += 1;
        return;
      }

      if (!answerMaps[matchId].has(username)) {
        answerMaps[matchId].set(username, answer.slice(0, 100));
        metrics.answersAccepted += 1;
        socket.emit("answerAccepted", {
          questionId,
          receivedAt: Date.now(),
        });
      }
    });

    socket.on("checkGameStatus", ({ matchId }) => {
      if (typeof matchId !== "string") return;
      const question = currentQuestions[matchId];
      const username = socket.data.username;

      socket.emit("gameStatus", {
        matchId,
        category: socket.data.category,
        started: gameStartedFlags[matchId] || false,
        question: question ? getPublicQuestion(question) : null,
        eliminated: username && eliminatedPlayers[matchId]?.has(username) ? [username] : [],
      });
    });

    socket.on("disconnect", () => {
      answerRateLimits.delete(socket.id);
      const { username, matchId, category } = socket.data;
      if (!username || !matchId || !lobbies[matchId] || isBot(username)) return;

      pendingDisconnects[matchId] ??= new Map();
      clearDisconnectTimer(matchId, username);

      io.to(matchId).emit("playerConnectionChanged", {
        username,
        connected: false,
        gracePeriodSeconds: RECONNECT_GRACE_MS / 1000,
      });

      const timer = setTimeout(() => {
        lobbies[matchId] = lobbies[matchId].filter((name) => name !== username);
        pendingDisconnects[matchId]?.delete(username);

        if (hosts[matchId] === username) {
          hosts[matchId] = lobbies[matchId].find((name) => !isBot(name)) || null;
        }

        io.to(matchId).emit("lobbyUpdate", {
          category,
          players: lobbies[matchId],
          host: hosts[matchId],
          matchId,
        });
      }, RECONNECT_GRACE_MS);

      pendingDisconnects[matchId].set(username, timer);
    });
  });

  app.all("*", (req, res) => handle(req, res));

  const PORT = Number(process.env.PORT) || 3000;
  httpServer.listen(PORT, () => {
    console.log(`🚀 Server ready on http://localhost:${PORT}`);
  });
});
