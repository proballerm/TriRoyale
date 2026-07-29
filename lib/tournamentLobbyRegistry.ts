import { randomUUID } from "crypto";
import { TournamentCoordinator } from "./tournamentCoordinator";

export type TournamentLobbyPhase = "waiting" | "active" | "completed";

export type TournamentLobby = {
  id: string;
  coordinator: TournamentCoordinator;
  createdAt: number;
  phase: TournamentLobbyPhase;
  visiblePlayers: number;
  targetPlayers: number;
  ownerPlayerId: string;
  usedQuestionFingerprints: Set<string>;
  fillTimer: NodeJS.Timeout | null;
};

const lobbies = new Map<string, TournamentLobby>();
const lobbyByPlayer = new Map<string, string>();
const lobbyByDuel = new Map<string, string>();

export function createTournamentLobby(ownerPlayerId: string): TournamentLobby {
  leaveCurrentTournamentLobby(ownerPlayerId);

  const id = randomUUID();
  const lobby: TournamentLobby = {
    id,
    coordinator: new TournamentCoordinator(id, 1000),
    createdAt: Date.now(),
    phase: "waiting",
    visiblePlayers: 1,
    targetPlayers: 1000,
    ownerPlayerId,
    usedQuestionFingerprints: new Set<string>(),
    fillTimer: null,
  };

  lobbies.set(id, lobby);
  lobbyByPlayer.set(ownerPlayerId, id);
  return lobby;
}

export function getTournamentLobby(lobbyId: string): TournamentLobby | null {
  return lobbies.get(lobbyId) ?? null;
}

export function getTournamentLobbyForPlayer(playerId: string): TournamentLobby | null {
  const lobbyId = lobbyByPlayer.get(playerId);
  return lobbyId ? getTournamentLobby(lobbyId) : null;
}

export function getTournamentLobbyForDuel(duelId: string): TournamentLobby | null {
  const lobbyId = lobbyByDuel.get(duelId);
  return lobbyId ? getTournamentLobby(lobbyId) : null;
}

export function bindPlayerToLobby(playerId: string, lobbyId: string): void {
  if (!lobbies.has(lobbyId)) throw new Error("Tournament lobby not found");
  lobbyByPlayer.set(playerId, lobbyId);
}

export function bindDuelToLobby(duelId: string, lobbyId: string): void {
  if (!lobbies.has(lobbyId)) throw new Error("Tournament lobby not found");
  lobbyByDuel.set(duelId, lobbyId);
}

export function leaveCurrentTournamentLobby(playerId: string): void {
  const currentLobbyId = lobbyByPlayer.get(playerId);
  if (!currentLobbyId) return;
  lobbyByPlayer.delete(playerId);

  const lobby = lobbies.get(currentLobbyId);
  if (!lobby || lobby.ownerPlayerId !== playerId) return;
  if (lobby.fillTimer) clearInterval(lobby.fillTimer);
  lobbies.delete(currentLobbyId);
  for (const [duelId, lobbyId] of lobbyByDuel) {
    if (lobbyId === currentLobbyId) lobbyByDuel.delete(duelId);
  }
}

export function completeTournamentLobby(lobbyId: string): void {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;
  lobby.phase = "completed";
  if (lobby.fillTimer) clearInterval(lobby.fillTimer);
  lobby.fillTimer = null;
}

export function deleteTournamentLobby(lobbyId: string): void {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;
  if (lobby.fillTimer) clearInterval(lobby.fillTimer);
  lobbies.delete(lobbyId);
  for (const [playerId, mappedLobbyId] of lobbyByPlayer) {
    if (mappedLobbyId === lobbyId) lobbyByPlayer.delete(playerId);
  }
  for (const [duelId, mappedLobbyId] of lobbyByDuel) {
    if (mappedLobbyId === lobbyId) lobbyByDuel.delete(duelId);
  }
}

export function getLatestTournamentCoordinator(): TournamentCoordinator {
  const latest = [...lobbies.values()].sort((a, b) => b.createdAt - a.createdAt)[0];
  return latest?.coordinator ?? new TournamentCoordinator("spectator-empty", 1000);
}
