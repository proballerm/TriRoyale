import type { Server, Socket } from "socket.io";
import {
  getTournamentCoordinator,
  registerTournamentSocketHandlers as registerBaseTournamentSocketHandlers,
} from "./tournamentSocketHandlers";
import { verifyTournamentSocketToken } from "./tournamentSocketToken";

const activeTournamentSocketByPlayer = new Map<string, string>();
const protectedTournamentEvents = new Set([
  "joinTournament",
  "startTournamentDuel",
  "submitTournamentAnswer",
]);

type VerifiedTournamentIdentity = {
  playerId: string;
  displayName: string;
};

function getVerifiedIdentity(socket: Socket): VerifiedTournamentIdentity | null {
  const payload = verifyTournamentSocketToken(socket.handshake.auth?.tournamentToken);
  if (!payload) return null;
  return {
    playerId: payload.playerId,
    displayName: payload.displayName,
  };
}

function claimPlayerSession(io: Server, socket: Socket, playerId: string): void {
  const previousSocketId = activeTournamentSocketByPlayer.get(playerId);
  if (previousSocketId && previousSocketId !== socket.id) {
    const previousSocket = io.sockets.sockets.get(previousSocketId);
    previousSocket?.emit("tournamentSessionReplaced", {
      message: "Your tournament session was opened in another browser or tab.",
    });
    previousSocket?.disconnect(true);
  }

  activeTournamentSocketByPlayer.set(playerId, socket.id);
  socket.data.tournamentPlayerId = playerId;
}

export function registerTournamentSocketHandlers(io: Server, socket: Socket): void {
  socket.use((packet, next) => {
    const [eventName, rawPayload] = packet;
    if (typeof eventName !== "string" || !protectedTournamentEvents.has(eventName)) {
      next();
      return;
    }

    const identity = getVerifiedIdentity(socket);
    if (!identity) {
      socket.emit("tournamentAuthenticationRequired", {
        message: "Your tournament login expired. Refreshing the live connection should fix it.",
      });
      return;
    }

    if (eventName === "joinTournament") {
      claimPlayerSession(io, socket, identity.playerId);
      const payload = rawPayload && typeof rawPayload === "object"
        ? rawPayload as Record<string, unknown>
        : {};
      packet[1] = {
        ...payload,
        playerId: identity.playerId,
        displayName: identity.displayName,
      };
    } else {
      const claimedSocketId = activeTournamentSocketByPlayer.get(identity.playerId);
      if (claimedSocketId && claimedSocketId !== socket.id) {
        socket.emit("tournamentSessionReplaced", {
          message: "This tournament account is active in another browser or tab.",
        });
        return;
      }
      claimPlayerSession(io, socket, identity.playerId);
    }

    next();
  });

  socket.on("disconnect", () => {
    const playerId = socket.data.tournamentPlayerId as string | undefined;
    if (playerId && activeTournamentSocketByPlayer.get(playerId) === socket.id) {
      activeTournamentSocketByPlayer.delete(playerId);
    }
  });

  registerBaseTournamentSocketHandlers(io, socket);
}

export { getTournamentCoordinator };
