import { randomUUID } from "crypto";
import {
  BotSimulationResult,
  TournamentDuel,
  TournamentManager,
  TournamentManagerState,
  TournamentPlayer,
  TournamentSnapshot,
} from "./tournamentManager";

export type TournamentMatchFound = {
  tournament: TournamentSnapshot;
  duel: TournamentDuel;
  player: TournamentPlayer;
  opponent: TournamentPlayer;
};

export type TournamentJoinResult =
  | { status: "matched"; match: TournamentMatchFound }
  | { status: "queued"; tournament: TournamentSnapshot; player: TournamentPlayer };

export class TournamentCoordinator {
  private manager: TournamentManager;
  private readonly duelByPlayer = new Map<string, string>();

  constructor(
    tournamentId = randomUUID(),
    startingPlayers = 1000,
    private readonly random: () => number = Math.random,
  ) {
    this.manager = new TournamentManager(tournamentId, startingPlayers, random);
    this.rebuildActiveDuelIndex();
  }

  restore(state: TournamentManagerState): TournamentSnapshot {
    this.manager = TournamentManager.fromState(state, this.random);
    this.rebuildActiveDuelIndex();
    return this.manager.getSnapshot();
  }

  exportState(): TournamentManagerState {
    return this.manager.exportState();
  }

  join(playerId: string, displayName: string): TournamentJoinResult {
    const existingDuelId = this.duelByPlayer.get(playerId);
    if (existingDuelId) {
      const existingMatch = this.getMatchForPlayer(playerId);
      if (existingMatch) return { status: "matched", match: existingMatch };
    }
    const player = this.manager.addHuman(playerId, displayName);
    const duel = this.manager.createNextDuel();
    if (!duel || ![duel.playerOneId, duel.playerTwoId].includes(playerId)) {
      return { status: "queued", tournament: this.manager.getSnapshot(), player };
    }
    this.trackDuel(duel);
    return { status: "matched", match: this.buildMatch(playerId, duel) };
  }

  getMatchForPlayer(playerId: string): TournamentMatchFound | null {
    const duelId = this.duelByPlayer.get(playerId);
    if (!duelId) return null;
    const duel = this.manager.getDuel(duelId);
    if (!duel || duel.winnerId) {
      this.duelByPlayer.delete(playerId);
      return null;
    }
    return this.buildMatch(playerId, duel);
  }

  simulateBackgroundBotDuels(maxDuels = Number.POSITIVE_INFINITY): BotSimulationResult {
    return this.manager.simulateQueuedBotDuels(maxDuels);
  }

  completeMatch(duelId: string, winnerId: string): {
    duel: TournamentDuel;
    winner: TournamentPlayer;
    loser: TournamentPlayer;
    tournament: TournamentSnapshot;
    nextMatch: TournamentMatchFound | null;
    background: BotSimulationResult;
  } {
    const before = this.manager.getDuel(duelId);
    if (!before) throw new Error("Duel not found");
    const completed = this.manager.completeDuel(duelId, winnerId);
    const loserId = completed.playerOneId === winnerId ? completed.playerTwoId : completed.playerOneId;
    this.duelByPlayer.delete(completed.playerOneId);
    this.duelByPlayer.delete(completed.playerTwoId);
    const winner = this.requirePlayer(winnerId);
    const loser = this.requirePlayer(loserId);
    const background = this.manager.simulateQueuedBotDuels();
    let nextMatch: TournamentMatchFound | null = null;
    if (winner.status !== "champion") {
      const nextDuel = this.manager.createNextDuel();
      if (nextDuel && [nextDuel.playerOneId, nextDuel.playerTwoId].includes(winnerId)) {
        this.trackDuel(nextDuel);
        nextMatch = this.buildMatch(winnerId, nextDuel);
      }
    }
    return {
      duel: completed,
      winner: this.requirePlayer(winnerId),
      loser,
      tournament: this.manager.getSnapshot(),
      nextMatch,
      background,
    };
  }

  getSnapshot(): TournamentSnapshot { return this.manager.getSnapshot(); }
  getPlayer(playerId: string): TournamentPlayer | null { return this.manager.getPlayer(playerId); }

  reset(tournamentId = randomUUID()): TournamentSnapshot {
    this.manager = new TournamentManager(tournamentId, 1000, this.random);
    this.duelByPlayer.clear();
    return this.manager.getSnapshot();
  }

  private rebuildActiveDuelIndex(): void {
    this.duelByPlayer.clear();
    for (const duel of this.manager.exportState().duels) {
      if (!duel.winnerId) this.trackDuel(duel);
    }
  }
  private trackDuel(duel: TournamentDuel): void {
    this.duelByPlayer.set(duel.playerOneId, duel.id);
    this.duelByPlayer.set(duel.playerTwoId, duel.id);
  }
  private buildMatch(playerId: string, duel: TournamentDuel): TournamentMatchFound {
    const player = this.requirePlayer(playerId);
    const opponentId = duel.playerOneId === playerId ? duel.playerTwoId : duel.playerOneId;
    const opponent = this.requirePlayer(opponentId);
    return { tournament: this.manager.getSnapshot(), duel, player, opponent };
  }
  private requirePlayer(playerId: string): TournamentPlayer {
    const player = this.manager.getPlayer(playerId);
    if (!player) throw new Error("Player not found");
    return player;
  }
}
