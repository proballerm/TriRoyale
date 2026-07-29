export const TOURNAMENT_DUEL_QUESTION_TIME_SECONDS = 12;
export const FINAL_QUESTION_MULTIPLIER = 2;

export type DuelQuestion = {
  id: string;
  category: string;
  question: string;
  answers: string[];
  correctAnswer: string;
  explanation?: string;
  timeLimit: number;
};

export type DuelPlayerScore = {
  playerId: string;
  correctAnswers: number;
  score: number;
  totalResponseMs: number;
};

export type DuelAnswerResult = {
  accepted: boolean;
  correct: boolean;
  points: number;
  multiplier: number;
  score: DuelPlayerScore;
};

export type StoredDuelAnswer = {
  playerId: string;
  answer: string;
  responseMs: number;
  correct: boolean;
  points: number;
  multiplier?: number;
};

export type TournamentDuelEngineState = {
  duelId: string;
  playerIds: [string, string];
  questions: DuelQuestion[];
  scores: DuelPlayerScore[];
  answersByQuestion: Array<{ questionIndex: number; answers: StoredDuelAnswer[] }>;
  questionIndex: number;
  questionStartedAt: number;
  completed: boolean;
  updatedAt: number;
};

type StoredAnswer = Omit<StoredDuelAnswer, "playerId">;

export class TournamentDuelEngine {
  private readonly scores = new Map<string, DuelPlayerScore>();
  private readonly answersByQuestion = new Map<number, Map<string, StoredAnswer>>();
  private questionIndex = 0;
  private questionStartedAt = 0;
  private completed = false;

  constructor(
    readonly duelId: string,
    readonly playerIds: [string, string],
    readonly questions: DuelQuestion[],
  ) {
    if (!duelId.trim()) throw new Error("duelId is required");
    if (playerIds[0] === playerIds[1]) throw new Error("A duel requires two different players");
    if (questions.length === 0) throw new Error("At least one question is required");

    for (const playerId of playerIds) {
      this.scores.set(playerId, { playerId, correctAnswers: 0, score: 0, totalResponseMs: 0 });
    }
  }

  static restore(state: TournamentDuelEngineState): TournamentDuelEngine {
    const engine = new TournamentDuelEngine(state.duelId, state.playerIds, state.questions);
    engine.questionIndex = state.questionIndex;
    engine.questionStartedAt = state.questionStartedAt;
    engine.completed = state.completed;
    engine.scores.clear();
    for (const score of state.scores) engine.scores.set(score.playerId, structuredClone(score));
    for (const entry of state.answersByQuestion) {
      const answers = new Map<string, StoredAnswer>();
      for (const answer of entry.answers) {
        const { playerId, ...stored } = answer;
        answers.set(playerId, stored);
      }
      engine.answersByQuestion.set(entry.questionIndex, answers);
    }
    return engine;
  }

  exportState(): TournamentDuelEngineState {
    return {
      duelId: this.duelId,
      playerIds: [...this.playerIds] as [string, string],
      questions: structuredClone(this.questions),
      scores: this.getScores(),
      answersByQuestion: [...this.answersByQuestion.entries()].map(([questionIndex, answers]) => ({
        questionIndex,
        answers: [...answers.entries()].map(([playerId, answer]) => ({ playerId, ...structuredClone(answer) })),
      })),
      questionIndex: this.questionIndex,
      questionStartedAt: this.questionStartedAt,
      completed: this.completed,
      updatedAt: Date.now(),
    };
  }

  startQuestion(startedAt = Date.now()): DuelQuestion {
    if (this.completed) throw new Error("Duel is already complete");
    this.questionStartedAt = startedAt;
    return this.getCurrentQuestion();
  }

  submitAnswer(playerId: string, questionId: string, answer: string, answeredAt = Date.now()): DuelAnswerResult {
    if (this.completed) throw new Error("Duel is already complete");
    if (!this.scores.has(playerId)) throw new Error("Player is not part of this duel");

    const question = this.getCurrentQuestion();
    if (question.id !== questionId) throw new Error("Answer does not match the active question");
    if (!this.questionStartedAt) throw new Error("Question has not started");

    const answers = this.answersByQuestion.get(this.questionIndex) ?? new Map<string, StoredAnswer>();
    this.answersByQuestion.set(this.questionIndex, answers);
    const existing = answers.get(playerId);
    if (existing) {
      return {
        accepted: false,
        correct: existing.correct,
        points: existing.points,
        multiplier: existing.multiplier ?? this.getQuestionMultiplier(),
        score: this.getScore(playerId),
      };
    }

    const deadline = this.questionStartedAt + question.timeLimit * 1000;
    const responseMs = Math.max(0, Math.min(answeredAt - this.questionStartedAt, question.timeLimit * 1000));
    const withinDeadline = answeredAt <= deadline + 250;
    const correct = withinDeadline && normalize(answer) === normalize(question.correctAnswer);
    const speedRatio = Math.max(0, 1 - responseMs / (question.timeLimit * 1000));
    const multiplier = this.getQuestionMultiplier();
    const basePoints = 1000 + Math.round(speedRatio * 500);
    const points = correct ? basePoints * multiplier : 0;

    answers.set(playerId, { answer, responseMs, correct, points, multiplier });
    const score = this.scores.get(playerId)!;
    score.totalResponseMs += responseMs;
    score.score += points;
    if (correct) score.correctAnswers += 1;
    return { accepted: true, correct, points, multiplier, score: structuredClone(score) };
  }

  hasAnswered(playerId: string): boolean {
    return this.answersByQuestion.get(this.questionIndex)?.has(playerId) ?? false;
  }

  isQuestionComplete(): boolean {
    return this.playerIds.every((playerId) => this.hasAnswered(playerId));
  }

  advanceQuestion(): DuelQuestion | null {
    if (this.completed) return null;
    if (this.questionIndex >= this.questions.length - 1) {
      this.completed = true;
      return null;
    }
    this.questionIndex += 1;
    this.questionStartedAt = 0;
    return this.getCurrentQuestion();
  }

  getCurrentQuestion(): DuelQuestion {
    const question = this.questions[this.questionIndex];
    if (!question) throw new Error("No active question");
    return structuredClone(question);
  }

  getQuestionNumber(): number { return this.questionIndex + 1; }
  getQuestionMultiplier(): number {
    return this.questionIndex === this.questions.length - 1 ? FINAL_QUESTION_MULTIPLIER : 1;
  }
  getQuestionStartedAt(): number { return this.questionStartedAt; }
  getQuestionDeadline(): number {
    if (!this.questionStartedAt) return 0;
    return this.questionStartedAt + this.getCurrentQuestion().timeLimit * 1000;
  }
  getScores(): DuelPlayerScore[] { return this.playerIds.map((playerId) => this.getScore(playerId)); }
  getScore(playerId: string): DuelPlayerScore {
    const score = this.scores.get(playerId);
    if (!score) throw new Error("Player is not part of this duel");
    return structuredClone(score);
  }
  isComplete(): boolean { return this.completed; }

  getWinnerId(): string {
    if (!this.completed) throw new Error("Duel is not complete");
    const [one, two] = this.getScores();
    if (one.score !== two.score) return one.score > two.score ? one.playerId : two.playerId;
    if (one.correctAnswers !== two.correctAnswers) return one.correctAnswers > two.correctAnswers ? one.playerId : two.playerId;
    if (one.totalResponseMs !== two.totalResponseMs) return one.totalResponseMs < two.totalResponseMs ? one.playerId : two.playerId;
    return stableTieBreak(this.duelId, this.playerIds);
  }
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function stableTieBreak(duelId: string, playerIds: [string, string]): string {
  let hash = 2166136261;
  for (const character of duelId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return playerIds[Math.abs(hash) % playerIds.length];
}
