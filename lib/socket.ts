// lib/socket.ts
import io from "socket.io-client";

const HUMAN_MATCHMAKING_GRACE_MS = 3_000;

type JoinTournamentPayload = {
  playerId: string;
  displayName: string;
};

type TournamentJoinedPayload = {
  player?: {
    id?: string;
    status?: string;
  };
};

let socket: ReturnType<typeof io> | null = null;
let lastTournamentJoin: JoinTournamentPayload | null = null;
let botFallbackTimer: ReturnType<typeof setTimeout> | null = null;

function clearBotFallbackTimer(): void {
  if (botFallbackTimer) clearTimeout(botFallbackTimer);
  botFallbackTimer = null;
}

export function getSocket(): ReturnType<typeof io> {
  if (!socket) {
    const url =
      process.env.NEXT_PUBLIC_WS_URL ||
      (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

    socket = io(url, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      autoConnect: false,
      timeout: 10_000,
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 5_000,
    });

    socket.onAnyOutgoing((eventName: string, ...args: unknown[]) => {
      if (eventName !== "joinTournament") return;
      const payload = args[0] as Partial<JoinTournamentPayload> | undefined;
      if (typeof payload?.playerId === "string" && typeof payload.displayName === "string") {
        lastTournamentJoin = {
          playerId: payload.playerId,
          displayName: payload.displayName,
        };
      }
    });

    socket.on("tournamentJoined", (payload: TournamentJoinedPayload) => {
      clearBotFallbackTimer();
      if (payload.player?.status !== "queued" || !lastTournamentJoin) return;

      botFallbackTimer = setTimeout(() => {
        if (!socket?.connected || !lastTournamentJoin) return;
        socket.emit("joinTournament", lastTournamentJoin);
      }, HUMAN_MATCHMAKING_GRACE_MS);
    });

    socket.on("tournamentMatchFound", clearBotFallbackTimer);
    socket.on("disconnect", clearBotFallbackTimer);

    socket.on("connect_error", (error: Error) => {
      console.warn(
        `[socket] Failed to connect to ${url}/socket.io: ${error.message}. ` +
          "Make sure the app is running with `npm run dev`, which starts the custom Socket.IO server.",
      );
    });
  }

  return socket;
}
