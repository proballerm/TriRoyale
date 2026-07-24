export type MatchEventType =
  | "player_joined"
  | "player_reconnected"
  | "player_disconnected"
  | "match_started"
  | "question_started"
  | "answer_accepted"
  | "round_completed"
  | "match_completed";

export type MatchEvent = {
  sequence: number;
  matchId: string;
  type: MatchEventType;
  occurredAt: number;
  payload: Record<string, unknown>;
};

export class MatchEventStore {
  private readonly eventsByMatch = new Map<string, MatchEvent[]>();
  private readonly sequenceByMatch = new Map<string, number>();

  constructor(private readonly maxEventsPerMatch = 200) {
    if (!Number.isInteger(maxEventsPerMatch) || maxEventsPerMatch <= 0) {
      throw new Error("maxEventsPerMatch must be a positive integer");
    }
  }

  append(
    matchId: string,
    type: MatchEventType,
    payload: Record<string, unknown> = {},
    occurredAt = Date.now(),
  ): MatchEvent {
    const safeMatchId = matchId.trim();
    if (!safeMatchId) throw new Error("matchId is required");

    const sequence = (this.sequenceByMatch.get(safeMatchId) ?? 0) + 1;
    this.sequenceByMatch.set(safeMatchId, sequence);

    const event: MatchEvent = {
      sequence,
      matchId: safeMatchId,
      type,
      occurredAt,
      payload: structuredClone(payload),
    };

    const events = this.eventsByMatch.get(safeMatchId) ?? [];
    events.push(event);

    if (events.length > this.maxEventsPerMatch) {
      events.splice(0, events.length - this.maxEventsPerMatch);
    }

    this.eventsByMatch.set(safeMatchId, events);
    return structuredClone(event);
  }

  list(matchId: string, afterSequence = 0): MatchEvent[] {
    const events = this.eventsByMatch.get(matchId.trim()) ?? [];
    return events
      .filter((event) => event.sequence > afterSequence)
      .map((event) => structuredClone(event));
  }

  clear(matchId: string): void {
    const safeMatchId = matchId.trim();
    this.eventsByMatch.delete(safeMatchId);
    this.sequenceByMatch.delete(safeMatchId);
  }

  getMatchCount(): number {
    return this.eventsByMatch.size;
  }
}
