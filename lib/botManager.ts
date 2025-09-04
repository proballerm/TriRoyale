// lib/botManager.ts
import ClientIO from "socket.io-client";

const BOT_COUNT = 19;
const BOT_NAMES = Array.from({ length: BOT_COUNT }, (_, i) => `🤖Bot_${i + 1}`);

// Prefer explicit WS_URL; fall back to public site URL; finally localhost for dev
const WS_URL =
  process.env.WS_URL ||
  process.env.NEXT_PUBLIC_WS_URL ||
  process.env.APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export async function launchBots(io: any, matchId: string, category: string): Promise<void> {
  const bots: { name: string; socket: any; alive: boolean }[] = [];
  const connectedBots: Promise<void>[] = [];

  for (const name of BOT_NAMES) {
    const socket = ClientIO(WS_URL, {
      path: "/socket.io",
      transports: ["websocket"],        // avoid long-polling in prod
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 800,
      forceNew: true,
      timeout: 10000,                   // fail fast if wrong URL
    });

    const bot = { name, socket, alive: true };
    bots.push(bot);

    const joined = new Promise<void>((resolve) => {
      let lobbyConfirmed = false;

      socket.on("connect", () => {
        socket.emit("joinLobby", { username: name, category, matchId });
      });

      socket.on("lobbyUpdate", (data: { matchId: string; players: string[] }) => {
        if (data.matchId === matchId && data.players.includes(name) && !lobbyConfirmed) {
          lobbyConfirmed = true;
          resolve();
        }
      });

      socket.on("disconnect", () => { bot.alive = false; });
    });

    connectedBots.push(joined);

    socket.on("newQuestion", (payload: {
      question: string;
      answers: string[];
      timeLimit: number;
      matchId: string;
      correct: string; // "A" | "B" | "C" | "D"
    }) => {
      if (!bot.alive || payload.matchId !== matchId) return;

      const correctIndex = ["A","B","C","D"].indexOf(payload.correct);
      const correctAnswer = payload.answers[correctIndex];

      // ~60% correct rate
      const chooseCorrect = Math.random() < 0.6;
      const chosenAnswer = chooseCorrect
        ? correctAnswer
        : payload.answers.filter(a => a !== correctAnswer)[Math.floor(Math.random()*3)];

      const delay = Math.random() * (payload.timeLimit * 1000 - 1000) + 500;

      setTimeout(() => {
        if (!bot.alive) return;
        socket.emit("answer", { username: name, matchId, answer: chosenAnswer });
      }, delay);
    });

    socket.on("eliminated", ({ username }: { username: string }) => {
      if (username === name) bot.alive = false;
    });

    socket.on("gameOver", () => { bot.alive = true; });
  }

  await Promise.all(connectedBots);
}
