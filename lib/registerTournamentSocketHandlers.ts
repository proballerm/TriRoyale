import type { Server, Socket } from "socket.io";
import {
  getTournamentCoordinator,
  registerTournamentSocketHandlers as registerGameplayHandlers,
} from "./secureTournamentSocketHandlers";
import { registerTournamentSpectatorHandlers } from "./registerTournamentSpectatorHandlers";

export { getTournamentCoordinator };

export function registerTournamentSocketHandlers(io: Server, socket: Socket): void {
  registerGameplayHandlers(io, socket);
  registerTournamentSpectatorHandlers(io, socket);
}
