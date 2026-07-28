import type { Server, Socket } from "socket.io";
import { getTournamentCoordinator } from "./registerTournamentSocketHandlers";

const SPECTATOR_ROOM = "tournament-spectators";

export function registerTournamentSpectatorHandlers(io: Server, socket: Socket): void {
  const emitState = () => {
    socket.emit("tournamentSpectatorState", getTournamentCoordinator().getSpectatorState());
  };

  socket.on("subscribeTournamentSpectator", () => {
    socket.join(SPECTATOR_ROOM);
    emitState();
  });

  socket.on("unsubscribeTournamentSpectator", () => {
    socket.leave(SPECTATOR_ROOM);
  });

  socket.on("getTournamentSpectatorState", emitState);
}

export function broadcastTournamentSpectatorState(io: Server): void {
  io.to(SPECTATOR_ROOM).emit(
    "tournamentSpectatorState",
    getTournamentCoordinator().getSpectatorState(),
  );
}
