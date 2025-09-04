// lib/socket.ts
import io, { Socket } from "socket.io-client";

let socket: ReturnType<typeof io> | null = null;

export function getSocket(): ReturnType<typeof io> {
  if (!socket) {
    const url =
      process.env.NEXT_PUBLIC_WS_URL ||
      (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

    socket = io(url, {
      path: "/socket.io",
      transports: ["websocket"],
      autoConnect: false,
    });

  socket.on("connect_error", (e: Error) => console.error("[socket] connect_error:", e?.message));
  }
  return socket;
}

