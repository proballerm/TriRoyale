// lib/socket.ts
import io from "socket.io-client";

// Avoid importing the Socket type; infer from io()
let socket: ReturnType<typeof io> | null = null;

export function getSocket() {
  if (!socket) {
    // Use same-origin by default; works locally & in prod
    socket = io({
      path: "/socket.io",
      transports: ["websocket"], // or ["polling"] if you prefer
    });
  }
  return socket;
}
