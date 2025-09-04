// lib/socket.ts
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    console.log("🌟 Creating new socket connection");
    socket = io("http://localhost:3000", {
      path: "/socket.io",
      transports: ["polling"],
    });
  }
  return socket;
}
