import ClientIO from "socket.io-client";

const BOT_COUNT = 19;
const BOT_NAMES = Array.from({ length: BOT_COUNT }, (_, i) => `🤖Bot_${i + 1}`);

const WS_URL =
  process.env.WS_URL ||
  process.env.NEXT_PUBLIC_WS_URL ||
  process.env.APP_URL ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

export async function launchBots(
  _io: unknown,
  matchId: string,
  category: string,
): Promise<void> {
  const connectedBots: Promise<void>[] = [];

  for (const name of BOT_NAMES) {
    const socket = ClientIO(WS_URL, {
      path: "/socket.io",
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 800,
      forceNew: true,
      timeout: 10000,
    });

    let alive = true;

    connectedBots.push(
      new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        socket.on("connect", () => {
          socket.emit("joinLobby", { username: name, category, matchId });
        });

        socket.on("lobbyUpdate", (data: { matchId: string; players: string[] }) => {
          if (data.matchId === matchId && data.players.includes(name)) finish();
        });

        socket.on("connect_error", (error) => {
          if (!settled) {
            settled = true;
            reject(error);
          }
        });
      }),
    );

    socket.on("botQuestion", (payload: {
      answers: string[];
      timeLimit: number;
      matchId: string;
      correct: "A" | "B" | "C" | "D";
    }) => {
      if (!alive || payload.matchId !== matchId) return;

      const correctIndex = ["A", "B", "C", "D"].indexOf(payload.correct);
      const correctAnswer = payload.answers[correctIndex];
      const incorrectAnswers = payload.answers.filter(
        (answer) => answer !== correctAnswer,
      );

      const chooseCorrect = Math.random() < 0.6;
      const chosenAnswer = chooseCorrect
        ? correctAnswer
        : incorrectAnswers[Math.floor(Math.random() * incorrectAnswers.length)];
      const latestDelay = Math.max(700, payload.timeLimit * 1000 - 500);
      const delay = Math.random() * (latestDelay - 400) + 400;

      setTimeout(() => {
        if (!alive || !socket.connected) return;
        socket.emit("answer", { answer: chosenAnswer });
      }, delay);
    });

    socket.on("eliminated", ({ username }: { username: string }) => {
      if (username === name) alive = false;
    });

    socket.on("gameOver", () => {
      alive = false;
      socket.disconnect();
    });

    socket.on("gameError", () => {
      alive = false;
      socket.disconnect();
    });

    socket.on("disconnect", () => {
      alive = false;
    });
  }

  await Promise.all(connectedBots);
}
