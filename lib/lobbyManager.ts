export type LobbySnapshot = {
  matchId: string;
  players: string[];
  host: string | null;
};

export type JoinLobbyResult = LobbySnapshot & {
  joined: boolean;
};

export type LeaveLobbyResult = LobbySnapshot & {
  removed: boolean;
  hostChanged: boolean;
};

export class LobbyManager {
  private readonly playersByMatch = new Map<string, string[]>();
  private readonly hostsByMatch = new Map<string, string | null>();

  constructor(private readonly isBot: (username: string) => boolean) {}

  join(matchId: string, username: string): JoinLobbyResult {
    const safeMatchId = this.requireValue(matchId, "matchId");
    const safeUsername = this.requireValue(username, "username");
    const players = this.playersByMatch.get(safeMatchId) ?? [];
    const joined = !players.includes(safeUsername);

    if (joined) players.push(safeUsername);
    this.playersByMatch.set(safeMatchId, players);

    const currentHost = this.hostsByMatch.get(safeMatchId) ?? null;
    if (!currentHost && !this.isBot(safeUsername)) {
      this.hostsByMatch.set(safeMatchId, safeUsername);
    } else if (!this.hostsByMatch.has(safeMatchId)) {
      this.hostsByMatch.set(safeMatchId, null);
    }

    return { ...this.snapshot(safeMatchId), joined };
  }

  leave(matchId: string, username: string): LeaveLobbyResult {
    const safeMatchId = this.requireValue(matchId, "matchId");
    const safeUsername = this.requireValue(username, "username");
    const existing = this.playersByMatch.get(safeMatchId) ?? [];
    const players = existing.filter((player) => player !== safeUsername);
    const removed = players.length !== existing.length;
    const previousHost = this.hostsByMatch.get(safeMatchId) ?? null;

    this.playersByMatch.set(safeMatchId, players);

    let nextHost = previousHost;
    if (previousHost === safeUsername || (previousHost && !players.includes(previousHost))) {
      nextHost = players.find((player) => !this.isBot(player)) ?? null;
      this.hostsByMatch.set(safeMatchId, nextHost);
    }

    return {
      ...this.snapshot(safeMatchId),
      removed,
      hostChanged: previousHost !== nextHost,
    };
  }

  hasPlayer(matchId: string, username: string): boolean {
    return (this.playersByMatch.get(matchId.trim()) ?? []).includes(username.trim());
  }

  getPlayerCount(matchId: string): number {
    return (this.playersByMatch.get(matchId.trim()) ?? []).length;
  }

  getTotalPlayerCount(): number {
    let total = 0;
    for (const players of this.playersByMatch.values()) total += players.length;
    return total;
  }

  snapshot(matchId: string): LobbySnapshot {
    const safeMatchId = matchId.trim();
    return {
      matchId: safeMatchId,
      players: [...(this.playersByMatch.get(safeMatchId) ?? [])],
      host: this.hostsByMatch.get(safeMatchId) ?? null,
    };
  }

  reset(matchId: string): void {
    const safeMatchId = matchId.trim();
    this.playersByMatch.delete(safeMatchId);
    this.hostsByMatch.delete(safeMatchId);
  }

  private requireValue(value: string, fieldName: string): string {
    const safeValue = value.trim();
    if (!safeValue) throw new Error(`${fieldName} is required`);
    return safeValue;
  }
}
