import { randomUUID } from "crypto";

export const TOURNAMENT_STARTING_PLAYERS = 1000;
export const QUESTIONS_PER_DUEL = 3;

export type TournamentPlayerKind = "human" | "bot";
export type TournamentPlayerStatus = "queued" | "matched" | "eliminated" | "champion";

export type TournamentPlayer = {
  id: string;
  displayName: string;
  kind: TournamentPlayerKind;
  status: TournamentPlayerStatus;
  round: number;
  wins: number;
};

export type TournamentDuel = {
  id: string;
  round: number;
  playerOneId: string;
  playerTwoId: string;
  questionCount: number;
  winnerId: string | null;
  completedAt: number | null;
};

export type TournamentSnapshot = {
  id: string;
  startingPlayers: number;
  remainingPlayers: number;
  round: number;
  queuedHumans: number;
  queuedBots: number;
  activeDuels: number;
  champion: TournamentPlayer | null;
};

const FIRST_NAMES = [
  "Aiden", "Amara", "Arjun", "Ava", "Caleb", "Camila", "Daniel", "Elena",
  "Ethan", "Grace", "Hana", "Isaac", "Jalen", "Kai", "Leah", "Liam",
  "Lucas", "Maya", "Mia", "Nadia", "Noah", "Olivia", "Owen", "Priya",
  "Ravi", "Ryan", "Sara", "Sofia", "Theo", "Zoe",
];

const LAST_INITIALS = [
  "A.", "B.", "C.", "D.", "F.", "G.", "H.", "J.", "K.", "L.",
  "M.", "N.", "P.", "R.", "S.", "T.", "V.", "W.", "Y.",
];

function safeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 40);
}

function shuffle<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export class TournamentManager {
  private readonly players = new Map<string, TournamentPlayer>();
  private readonly duels = new Map<string, TournamentDuel>();
  private readonly humanQueue: string[] = [];
  private readonly botQueue: string[] = [];
  private round = 1;
  private championId: string | null = null;

  constructor(
    readonly tournamentId = randomUUID(),
    private readonly startingPlayers = TOURNAMENT_STARTING_PLAYERS,
    private readonly random: () => number = Math.random,
  ) {
    if (!Number.isInteger(startingPlayers) || startingPlayers < 2) {
      throw new Error("startingPlayers must be an integer of at least 2");
    }

    this.fillWithBots();
  }

  addHuman(playerId: string, displayName: string): TournamentPlayer {
    const safeId = playerId.trim();
    const name = safeName(displayName);
    if (!safeId || !name) throw new Error("playerId and displayName are required");

    const existing = this.players.get(safeId);
    if (existing && existing.kind === "human" && existing.status !== "eliminated") {
      return structuredClone(existing);
    }

    const replaceableBotId = this.botQueue.shift();
    if (!replaceableBotId) {
      throw new Error("Tournament is full and has already started");
    }
    this.players.delete(replaceableBotId);

    const player: TournamentPlayer = {
      id: safeId,
      displayName: name,
      kind: "human",
      status: "queued",
      round: this.round,
      wins: 0,
    };
    this.players.set(safeId, player);
    this.humanQueue.push(safeId);
    return structuredClone(player);
  }

  createNextDuel(): TournamentDuel | null {
    const firstId = this.takeNextQueuedPlayer();
    if (!firstId) return null;

    const secondId = this.takeNextQueuedPlayer(firstId);
    if (!secondId) {
      this.requeue(firstId);
      return null;
    }

    const first = this.requirePlayer(firstId);
    const second = this.requirePlayer(secondId);
    first.status = "matched";
    second.status = "matched";

    const duel: TournamentDuel = {
      id: randomUUID(),
      round: this.round,
      playerOneId: firstId,
      playerTwoId: secondId,
      questionCount: QUESTIONS_PER_DUEL,
      winnerId: null,
      completedAt: null,
    };
    this.duels.set(duel.id, duel);
    return structuredClone(duel);
  }

  completeDuel(duelId: string, winnerId: string): TournamentDuel {
    const duel = this.duels.get(duelId);
    if (!duel) throw new Error("Duel not found");
    if (duel.winnerId) return structuredClone(duel);
    if (![duel.playerOneId, duel.playerTwoId].includes(winnerId)) {
      throw new Error("Winner must be a player in the duel");
    }

    const loserId = duel.playerOneId === winnerId ? duel.playerTwoId : duel.playerOneId;
    const winner = this.requirePlayer(winnerId);
    const loser = this.requirePlayer(loserId);

    winner.wins += 1;
    winner.status = "queued";
    winner.round = this.round + 1;
    loser.status = "eliminated";

    duel.winnerId = winnerId;
    duel.completedAt = Date.now();

    if (this.remainingPlayers === 1) {
      winner.status = "champion";
      this.championId = winnerId;
      this.humanQueue.length = 0;
      this.botQueue.length = 0;
    } else {
      this.requeue(winnerId);
      this.advanceRoundWhenReady();
    }

    return structuredClone(duel);
  }

  getPlayer(playerId: string): TournamentPlayer | null {
    const player = this.players.get(playerId);
    return player ? structuredClone(player) : null;
  }

  getDuel(duelId: string): TournamentDuel | null {
    const duel = this.duels.get(duelId);
    return duel ? structuredClone(duel) : null;
  }

  getSnapshot(): TournamentSnapshot {
    const champion = this.championId ? this.requirePlayer(this.championId) : null;
    return {
      id: this.tournamentId,
      startingPlayers: this.startingPlayers,
      remainingPlayers: this.remainingPlayers,
      round: this.round,
      queuedHumans: this.humanQueue.length,
      queuedBots: this.botQueue.length,
      activeDuels: [...this.duels.values()].filter((duel) => !duel.winnerId).length,
      champion: champion ? structuredClone(champion) : null,
    };
  }

  get remainingPlayers(): number {
    return [...this.players.values()].filter((player) => player.status !== "eliminated").length;
  }

  private fillWithBots(): void {
    const names = this.generateBotNames(this.startingPlayers);
    for (let index = 0; index < this.startingPlayers; index += 1) {
      const id = `bot-${this.tournamentId}-${index + 1}`;
      const bot: TournamentPlayer = {
        id,
        displayName: names[index],
        kind: "bot",
        status: "queued",
        round: 1,
        wins: 0,
      };
      this.players.set(id, bot);
      this.botQueue.push(id);
    }
  }

  private generateBotNames(count: number): string[] {
    const names: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const first = FIRST_NAMES[index % FIRST_NAMES.length];
      const last = LAST_INITIALS[Math.floor(index / FIRST_NAMES.length) % LAST_INITIALS.length];
      const cycle = Math.floor(index / (FIRST_NAMES.length * LAST_INITIALS.length));
      names.push(cycle === 0 ? `${first} ${last}` : `${first} ${last} ${cycle + 1}`);
    }
    return shuffle(names, this.random);
  }

  private takeNextQueuedPlayer(excludeId?: string): string | null {
    const humanIndex = this.humanQueue.findIndex((id) => id !== excludeId);
    if (humanIndex >= 0) return this.humanQueue.splice(humanIndex, 1)[0];

    const botIndex = this.botQueue.findIndex((id) => id !== excludeId);
    if (botIndex >= 0) return this.botQueue.splice(botIndex, 1)[0];
    return null;
  }

  private requeue(playerId: string): void {
    const player = this.requirePlayer(playerId);
    if (player.status === "eliminated" || player.status === "champion") return;
    const queue = player.kind === "human" ? this.humanQueue : this.botQueue;
    if (!queue.includes(playerId)) queue.push(playerId);
  }

  private advanceRoundWhenReady(): void {
    const activeDuels = [...this.duels.values()].some(
      (duel) => duel.round === this.round && !duel.winnerId,
    );
    const queuedThisRound = [...this.players.values()].some(
      (player) => player.status === "queued" && player.round === this.round,
    );
    if (!activeDuels && !queuedThisRound) this.round += 1;
  }

  private requirePlayer(playerId: string): TournamentPlayer {
    const player = this.players.get(playerId);
    if (!player) throw new Error("Player not found");
    return player;
  }
}
