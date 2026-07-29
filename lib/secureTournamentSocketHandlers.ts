import { getToken } from "next-auth/jwt";
import type { Server, Socket } from "socket.io";
import {
  getTournamentCoordinator,
  registerTournamentSocketHandlers as registerBaseTournamentSocketHandlers,
} from "./tournamentSocketHandlers";

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

async function getVerifiedIdentity(socket: Socket): Promise<VerifiedTournamentIdentity | null> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for tournament socket authentication");

  const forwardedProto = socket.request.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const secureCookie = protocol === "https" || process.env.NEXTAUTH_URL?.startsWith("https://") === true;

  const token = await getToken({
    req: socket.request as Parameters<typeof getToken>[0]["req"],
    secret,
    secureCookie,
  });

  if (!token) return null;

  const email = typeof token.email === "string" ? token.email.trim().toLowerCase() : "";
  const subject = typeof token.sub === "string" ? token.sub.trim() : "";
  const playerId = (email || subject).slice(0, 100);
  if (!playerId) return null;

  const tokenName = typeof token.name === "string" ? token.name.trim() : "";
  const fallbackName = email ? email.split("@")[0] : "Player";
  const displayName = (tokenName || fallbackName).replace(/\s+/g, " ").slice(0, 40);

  return { playerId, displayName };
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
  socket.use(async (packet, next) => {
    const [eventName, rawPayload] = packet;
    if (typeof eventName !== "string" || !protectedTournamentEvents.has(eventName)) {
      next();
      return;
    }

    try {
      const identity = await getVerifiedIdentity(socket);
      if (!identity) {
        socket.emit("tournamentError", {
          message: "Your login session was not available to the live tournament connection. Refresh the page and try again.",
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
          socket.emit("tournamentError", {
            message: "This tournament account is active in another browser or tab.",
          });
          return;
        }
        claimPlayerSession(io, socket, identity.playerId);
      }

      next();
    } catch (error) {
      console.error("[Tournament] Socket authentication failed", error);
      socket.emit("tournamentError", {
        message: "Tournament authentication failed. Refresh the page or sign in again.",
      });
    }
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
