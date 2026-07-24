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

const INTERMISSION_MS = 5000;
const QUESTION_TIME_SECONDS = 15;
const VALID_CATEGORIES = new Set([
  "Battle Royale",
  "Sports",
  "Science",
  "Movies",
  "History",
  "Geography",
  "Music",
]);

type GeneratedQuestion = Awaited<ReturnType<typeof generateTriviaQuestion>>;

type ActiveQuestion = GeneratedQuestion & {
  category: string;
  matchId: string;
  timeLimit: number;
  startTime: number;
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
    category: question.category,
    matchId: question.matchId,
    question: question.question,
    answers: question.answers,
    difficulty: question.difficulty,
    timeLimit: question.timeLimit,
    startTime: question.startTime,
  };
}

function clearMatchTimers(matchId: string) {
  if (roundTimers[matchId]) clearTimeout(roundTimers[matchId]);
  if (intermissionTimers[matchId]) clearTimeout(intermissionTimers[matchId]);
  delete roundTimers[matchId];
  delete intermissionTimers[matchId];
}

function resetMatch(matchId: string) {
  clearMatchTimers(matchId);
  gameStartedFlags[matchId] = false;
  currentQuestions[matchId] = null;
  lobbies[matchId] = [];
  hosts[matchId] = null;
  botsLaunchedFlags[matchId] = false;
  answerMaps[matchId] = new Map();
  eliminatedPlayers[matchId] = new Set();
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
  try {
    generated = await generateTriviaQuestion(actualCategory);
  } catch (error) {
    console.error(`[Match ${matchId}] Failed to load question`, error);
    io.to(matchId).emit("gameError", {
      message: "A new question could not be loaded. Please start a new match.",
    });
    resetMatch(matchId);
    return;
  }

  const question: ActiveQuestion = {
    ...generated,
    category: actualCategory,
    matchId,
    timeLimit: QUESTION_TIME_SECONDS,
    startTime: Date.now(),
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

        if (!isBot(winner)) {
          await recordWin(winner, category, io);
        }
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

  io.on("connection", (socket: Socket) => {
    socket.on("joinLobby", async ({ username, category, matchId }) => {
      const safeUsername = sanitizeUsername(username);
      if (!safeUsername || typeof matchId !== "string" || !matchId.trim()) return;
      if (!VALID_CATEGORIES.has(category)) {
        socket.emit("gameError", { message: "Invalid trivia category." });
        return;
      }

      const roomId = matchId.trim().slice(0, 100);
      if (gameStartedFlags[roomId] && !lobbies[roomId]?.includes(safeUsername)) {
        socket.emit("gameError", { message: "This match has already started." });
        return;
      }

      lobbies[roomId] ??= [];
      eliminatedPlayers[roomId] ??= new Set();

      if (!lobbies[roomId].includes(safeUsername)) {
        lobbies[roomId].push(safeUsername);
      }
      if (!hosts[roomId] && !isBot(safeUsername)) hosts[roomId] = safeUsername;

      socket.join(roomId);
      socket.data.username = safeUsername;
      socket.data.category = category;
      socket.data.matchId = roomId;

      if (!botsLaunchedFlags[roomId] && !isBot(safeUsername)) {
        botsLaunchedFlags[roomId] = true;
        launchBots(io, roomId, category).catch((error) => {
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
    });

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
      io.to(roomId).emit("startGame", { category, matchId: roomId });
      await startRound(io, roomId, category);
    });

    socket.on("answer", ({ answer }) => {
      const username = socket.data.username;
      const matchId = socket.data.matchId;
      if (
        !username ||
        !matchId ||
        typeof answer !== "string" ||
        !answerMaps[matchId] ||
        eliminatedPlayers[matchId]?.has(username) ||
        !lobbies[matchId]?.includes(username)
      ) {
        return;
      }

      if (!answerMaps[matchId].has(username)) {
        answerMaps[matchId].set(username, answer.slice(0, 100));
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
      const { username, matchId, category } = socket.data;
      if (!username || !matchId || !lobbies[matchId]) return;

      lobbies[matchId] = lobbies[matchId].filter((name) => name !== username);
      if (hosts[matchId] === username) {
        hosts[matchId] = lobbies[matchId].find((name) => !isBot(name)) || null;
      }

      io.to(matchId).emit("lobbyUpdate", {
        category,
        players: lobbies[matchId],
        host: hosts[matchId],
        matchId,
      });
    });
  });

  app.all("*", (req, res) => handle(req, res));

  const PORT = Number(process.env.PORT) || 3000;
  httpServer.listen(PORT, () => {
    console.log(`🚀 Server ready on http://localhost:${PORT}`);
  });
});
