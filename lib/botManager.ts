// lib/botManager.ts
import ClientIO from "socket.io-client";

const BOT_COUNT = 19;
const BOT_NAMES = Array.from({ length: BOT_COUNT }, (_, i) => `🤖Bot_${i + 1}`);

export async function launchBots(io: any, matchId: string, category: string): Promise<void> {
  const bots: {
    name: string;
    socket: any;
    alive: boolean;
  }[] = [];

  const connectedBots: Promise<void>[] = [];

  for (const name of BOT_NAMES) {
    const socket = ClientIO("http://localhost:3000", {
      path: "/socket.io",
      transports: ["websocket"],
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
          resolve(); // ✅ Bot confirmed in the correct lobby
        }
      });
    });

    connectedBots.push(joined);

    socket.on("newQuestion", (payload: {
      question: string;
      answers: string[];
      timeLimit: number;
      matchId: string;
      correct: string; // <-- Added correct letter (A-D)
    }) => {
      if (!bot.alive || payload.matchId !== matchId) return;

      const correctIndex = ["A", "B", "C", "D"].indexOf(payload.correct);
      const correctAnswer = payload.answers[correctIndex];

      let chosenAnswer: string;

      // ✅ Smarter bot: 70% chance of correct answer
      if (Math.random() < 0.6) {
        chosenAnswer = correctAnswer;
      } else {
        const wrongAnswers = payload.answers.filter((a) => a !== correctAnswer);
        chosenAnswer = wrongAnswers[Math.floor(Math.random() * wrongAnswers.length)];
      }

      const delay = Math.random() * (payload.timeLimit * 1000 - 1000) + 500;

      setTimeout(() => {
        if (!bot.alive) return;
        socket.emit("answer", {
          username: name,
          matchId,
          answer: chosenAnswer,
        });
      }, delay);
    });

    socket.on("eliminated", ({ username }: { username: string }) => {
      if (username === name) {
        bot.alive = false;
      }
    });

    socket.on("gameOver", () => {
      bot.alive = true; // Reset bot state in case reused
    });

    socket.on("disconnect", () => {
      bot.alive = false;
    });
  }

  // Wait for all bots to successfully join the lobby
  await Promise.all(connectedBots);
}
