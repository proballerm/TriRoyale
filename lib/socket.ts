// lib/socket.ts
import io from "socket.io-client";

let socket: ReturnType<typeof io> | null = null;
let authenticationRetryInProgress = false;

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

    socket.on("tournamentAuthenticationRequired", () => {
      if (!socket || authenticationRetryInProgress) return;
      authenticationRetryInProgress = true;
      socket.disconnect();
      socket.io.reconnection(true);
      window.setTimeout(() => {
        socket?.connect();
        authenticationRetryInProgress = false;
      }, 300);
    });

    socket.on("tournamentSessionReplaced", () => {
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
