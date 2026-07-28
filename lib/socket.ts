// lib/socket.ts
import io from "socket.io-client";

let socket: ReturnType<typeof io> | null = null;

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

    socket.on("connect_error", (error: Error) => {
      console.warn(
        `[socket] Failed to connect to ${url}/socket.io: ${error.message}. ` +
          "Make sure the app is running with `npm run dev`, which starts the custom Socket.IO server.",
      );
    });
  }

  return socket;
}
