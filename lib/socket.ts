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
let authenticationRetryInProgress = false;

function clearBotFallbackTimer(): void {
  if (botFallbackTimer) clearTimeout(botFallbackTimer);
  botFallbackTimer = null;
}

async function loadTournamentToken(): Promise<string> {
  const response = await fetch("/api/tournament/socket-auth", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(response.status === 401 ? "Not signed in" : "Unable to authorize tournament connection");
  }

  const payload = await response.json() as { token?: unknown };
  if (typeof payload.token !== "string" || !payload.token) {
    throw new Error("Tournament authorization token was missing");
  }

  return payload.token;
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
      auth: async (callback) => {
        try {
          callback({ tournamentToken: await loadTournamentToken() });
        } catch {
          callback({ tournamentToken: "" });
        }
      },
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

    socket.on("tournamentAuthenticationRequired", async () => {
      if (!socket || authenticationRetryInProgress) return;
      authenticationRetryInProgress = true;
      try {
        socket.disconnect();
        socket.io.reconnection(true);
        socket.connect();
      } finally {
        window.setTimeout(() => {
          authenticationRetryInProgress = false;
        }, 1_000);
      }
    });

    socket.on("tournamentSessionReplaced", () => {
      clearBotFallbackTimer();
      lastTournamentJoin = null;
      socket?.io.reconnection(false);
      socket?.disconnect();
    });

    socket.on("connect_error", (error: Error) => {
      console.warn(
        `[socket] Failed to connect to ${url}/socket.io: ${error.message}. ` +
          "Make sure the app is running with `npm run dev`, which starts the custom Socket.IO server.",
      );
    });
  }

  return socket;
}
