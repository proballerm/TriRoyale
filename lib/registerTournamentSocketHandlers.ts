import type { Server, Socket } from "socket.io";
import { TournamentCoordinator } from "./tournamentCoordinator";

const coordinator = new TournamentCoordinator();

function sanitizeIdentity(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const sanitized = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return sanitized || null;
}

export function registerTournamentSocketHandlers(io: Server, socket: Socket): void {
  socket.on("joinTournament", ({ playerId, displayName }: Record<string, unknown>) => {
    const safePlayerId = sanitizeIdentity(playerId, 100);
    const safeDisplayName = sanitizeIdentity(displayName, 40);

    if (!safePlayerId || !safeDisplayName) {
      socket.emit("tournamentError", {
        message: "A valid player identity and display name are required.",
      });
      return;
    }

    try {
      const result = coordinator.join(safePlayerId, safeDisplayName);
      socket.data.tournamentPlayerId = safePlayerId;
      socket.join(`tournament-player:${safePlayerId}`);

      socket.emit("tournamentJoined", {
        player: result.status === "matched" ? result.match.player : result.player,
        tournament:
          result.status === "matched" ? result.match.tournament : result.tournament,
      });

      if (result.status === "matched") {
        const { duel, player, opponent, tournament } = result.match;
        socket.emit("tournamentMatchFound", {
          duel,
          player,
          opponent,
          tournament,
        });

        if (opponent.kind === "human") {
          io.to(`tournament-player:${opponent.id}`).emit("tournamentMatchFound", {
            duel,
            player: opponent,
            opponent: player,
            tournament,
          });
        }
      }
    } catch (error) {
      socket.emit("tournamentError", {
        message: error instanceof Error ? error.message : "Unable to join tournament.",
      });
    }
  });

  socket.on("getTournamentStatus", () => {
    const playerId = socket.data.tournamentPlayerId as string | undefined;
    socket.emit("tournamentStatus", {
      tournament: coordinator.getSnapshot(),
      player: playerId ? coordinator.getPlayer(playerId) : null,
      match: playerId ? coordinator.getMatchForPlayer(playerId) : null,
    });
  });

  socket.on(
    "completeTournamentMatch",
    ({ duelId, winnerId }: Record<string, unknown>) => {
      const safeDuelId = sanitizeIdentity(duelId, 100);
      const safeWinnerId = sanitizeIdentity(winnerId, 100);
      const socketPlayerId = socket.data.tournamentPlayerId as string | undefined;

      if (!safeDuelId || !safeWinnerId || !socketPlayerId) {
        socket.emit("tournamentError", { message: "Invalid tournament result." });
        return;
      }

      const currentMatch = coordinator.getMatchForPlayer(socketPlayerId);
      if (!currentMatch || currentMatch.duel.id !== safeDuelId) {
        socket.emit("tournamentError", {
          message: "This player is not assigned to that duel.",
        });
        return;
      }

      try {
        const result = coordinator.completeMatch(safeDuelId, safeWinnerId);
        const payload = {
          duel: result.duel,
          winner: result.winner,
          loser: result.loser,
          tournament: result.tournament,
        };

        io.to(`tournament-player:${result.winner.id}`).emit(
          "tournamentMatchCompleted",
          payload,
        );
        io.to(`tournament-player:${result.loser.id}`).emit(
          "tournamentMatchCompleted",
          payload,
        );

        if (result.nextMatch) {
          const { duel, player, opponent, tournament } = result.nextMatch;
          io.to(`tournament-player:${player.id}`).emit("tournamentMatchFound", {
            duel,
            player,
            opponent,
            tournament,
          });

          if (opponent.kind === "human") {
            io.to(`tournament-player:${opponent.id}`).emit("tournamentMatchFound", {
              duel,
              player: opponent,
              opponent: player,
              tournament,
            });
          }
        }
      } catch (error) {
        socket.emit("tournamentError", {
          message:
            error instanceof Error
              ? error.message
              : "Unable to complete tournament match.",
        });
      }
    },
  );
}

export function getTournamentCoordinator(): TournamentCoordinator {
  return coordinator;
}
