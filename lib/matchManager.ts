export type MatchPhase = "lobby" | "question" | "intermission" | "completed";

export type MatchSnapshot = {
  matchId: string;
  category: string;
  phase: MatchPhase;
  started: boolean;
  roundNumber: number;
  currentQuestionId: string | null;
  winner: string | null;
  startedAt: number | null;
  completedAt: number | null;
};

type MatchState = MatchSnapshot;

export class MatchManager {
  private readonly matches = new Map<string, MatchState>();

  create(matchId: string, category: string): MatchSnapshot {
    const safeMatchId = matchId.trim();
    const safeCategory = category.trim();

    if (!safeMatchId) throw new Error("matchId is required");
    if (!safeCategory) throw new Error("category is required");
    if (this.matches.has(safeMatchId)) {
      throw new Error(`match ${safeMatchId} already exists`);
    }

    const match: MatchState = {
      matchId: safeMatchId,
      category: safeCategory,
      phase: "lobby",
      started: false,
      roundNumber: 0,
      currentQuestionId: null,
      winner: null,
      startedAt: null,
      completedAt: null,
    };

    this.matches.set(safeMatchId, match);
    return structuredClone(match);
  }

  ensure(matchId: string, category: string): MatchSnapshot {
    return this.get(matchId) ?? this.create(matchId, category);
  }

  start(matchId: string, startedAt = Date.now()): MatchSnapshot {
    const match = this.requireMatch(matchId);
    if (match.started) throw new Error("match has already started");
    if (match.phase === "completed") throw new Error("completed match cannot be restarted");

    match.started = true;
    match.phase = "intermission";
    match.startedAt = startedAt;
    return structuredClone(match);
  }

  beginQuestion(matchId: string, questionId: string): MatchSnapshot {
    const match = this.requireMatch(matchId);
    const safeQuestionId = questionId.trim();

    if (!match.started) throw new Error("match has not started");
    if (match.phase === "completed") throw new Error("completed match cannot start a question");
    if (!safeQuestionId) throw new Error("questionId is required");

    match.roundNumber += 1;
    match.phase = "question";
    match.currentQuestionId = safeQuestionId;
    return structuredClone(match);
  }

  beginIntermission(matchId: string): MatchSnapshot {
    const match = this.requireMatch(matchId);
    if (!match.started) throw new Error("match has not started");
    if (match.phase !== "question") throw new Error("intermission must follow a question");

    match.phase = "intermission";
    match.currentQuestionId = null;
    return structuredClone(match);
  }

  complete(matchId: string, winner: string | null, completedAt = Date.now()): MatchSnapshot {
    const match = this.requireMatch(matchId);
    if (!match.started) throw new Error("match has not started");
    if (match.phase === "completed") throw new Error("match is already completed");

    match.phase = "completed";
    match.currentQuestionId = null;
    match.winner = winner?.trim() || null;
    match.completedAt = completedAt;
    return structuredClone(match);
  }

  get(matchId: string): MatchSnapshot | null {
    const match = this.matches.get(matchId.trim());
    return match ? structuredClone(match) : null;
  }

  isActive(matchId: string): boolean {
    const match = this.matches.get(matchId.trim());
    return Boolean(match?.started && match.phase !== "completed");
  }

  getActiveCount(): number {
    let count = 0;
    for (const match of this.matches.values()) {
      if (match.started && match.phase !== "completed") count += 1;
    }
    return count;
  }

  reset(matchId: string): boolean {
    return this.matches.delete(matchId.trim());
  }

  private requireMatch(matchId: string): MatchState {
    const match = this.matches.get(matchId.trim());
    if (!match) throw new Error(`match ${matchId} does not exist`);
    return match;
  }
}
