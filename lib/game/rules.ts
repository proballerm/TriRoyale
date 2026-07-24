export type AnswerValidationInput = {
  username?: string | null;
  matchId?: string | null;
  answer: unknown;
  questionId: unknown;
  activeQuestionId?: string | null;
  deadline?: number | null;
  now?: number;
  hasAnswerMap: boolean;
  isEliminated: boolean;
  isActivePlayer: boolean;
  isRateLimited: boolean;
  alreadyAnswered: boolean;
};

export type AnswerValidationResult =
  | { accepted: true; normalizedAnswer: string }
  | {
      accepted: false;
      reason:
        | "missing_identity"
        | "invalid_payload"
        | "no_active_question"
        | "question_mismatch"
        | "deadline_passed"
        | "match_unavailable"
        | "player_eliminated"
        | "player_not_active"
        | "rate_limited"
        | "duplicate_answer";
    };

const ANSWER_MAX_LENGTH = 100;
const DEADLINE_GRACE_MS = 250;

export function sanitizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim().slice(0, 40);
  return username || null;
}

export function validateAnswerSubmission(
  input: AnswerValidationInput,
): AnswerValidationResult {
  const now = input.now ?? Date.now();

  if (!input.username || !input.matchId) {
    return { accepted: false, reason: "missing_identity" };
  }

  if (typeof input.answer !== "string" || typeof input.questionId !== "string") {
    return { accepted: false, reason: "invalid_payload" };
  }

  if (!input.activeQuestionId || input.deadline == null) {
    return { accepted: false, reason: "no_active_question" };
  }

  if (input.questionId !== input.activeQuestionId) {
    return { accepted: false, reason: "question_mismatch" };
  }

  if (now > input.deadline + DEADLINE_GRACE_MS) {
    return { accepted: false, reason: "deadline_passed" };
  }

  if (!input.hasAnswerMap) {
    return { accepted: false, reason: "match_unavailable" };
  }

  if (input.isEliminated) {
    return { accepted: false, reason: "player_eliminated" };
  }

  if (!input.isActivePlayer) {
    return { accepted: false, reason: "player_not_active" };
  }

  if (input.isRateLimited) {
    return { accepted: false, reason: "rate_limited" };
  }

  if (input.alreadyAnswered) {
    return { accepted: false, reason: "duplicate_answer" };
  }

  const normalizedAnswer = input.answer.trim().slice(0, ANSWER_MAX_LENGTH);
  if (!normalizedAnswer) {
    return { accepted: false, reason: "invalid_payload" };
  }

  return { accepted: true, normalizedAnswer };
}

export function isCorrectAnswer(answer: string | undefined, correctAnswer: string): boolean {
  if (!answer) return false;
  return answer.trim().toLocaleLowerCase() === correctAnswer.trim().toLocaleLowerCase();
}

export function selectNextHost(players: string[], isBot: (username: string) => boolean): string | null {
  return players.find((player) => !isBot(player)) ?? null;
}
