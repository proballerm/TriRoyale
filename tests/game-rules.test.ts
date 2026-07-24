import assert from "node:assert/strict";
import test from "node:test";

import {
  isCorrectAnswer,
  sanitizeUsername,
  selectNextHost,
  validateAnswerSubmission,
} from "../lib/game/rules";

const validSubmission = {
  username: "PlayerOne",
  matchId: "match-1",
  answer: "Mercury",
  questionId: "question-1",
  activeQuestionId: "question-1",
  deadline: 10_000,
  now: 9_500,
  hasAnswerMap: true,
  isEliminated: false,
  isActivePlayer: true,
  isRateLimited: false,
  alreadyAnswered: false,
};

test("sanitizeUsername trims input and enforces the 40 character limit", () => {
  assert.equal(sanitizeUsername("  Player One  "), "Player One");
  assert.equal(sanitizeUsername("x".repeat(50)), "x".repeat(40));
  assert.equal(sanitizeUsername("   "), null);
  assert.equal(sanitizeUsername(42), null);
});

test("accepts a valid server-authoritative answer submission", () => {
  assert.deepEqual(validateAnswerSubmission(validSubmission), {
    accepted: true,
    normalizedAnswer: "Mercury",
  });
});

test("rejects replayed and mismatched question submissions", () => {
  assert.deepEqual(
    validateAnswerSubmission({ ...validSubmission, alreadyAnswered: true }),
    { accepted: false, reason: "duplicate_answer" },
  );

  assert.deepEqual(
    validateAnswerSubmission({ ...validSubmission, questionId: "old-question" }),
    { accepted: false, reason: "question_mismatch" },
  );
});

test("rejects answers received outside the authoritative deadline", () => {
  assert.deepEqual(
    validateAnswerSubmission({ ...validSubmission, now: 10_251 }),
    { accepted: false, reason: "deadline_passed" },
  );
});

test("rejects eliminated, inactive, and rate-limited players", () => {
  assert.equal(
    validateAnswerSubmission({ ...validSubmission, isEliminated: true }).accepted,
    false,
  );
  assert.equal(
    validateAnswerSubmission({ ...validSubmission, isActivePlayer: false }).accepted,
    false,
  );
  assert.equal(
    validateAnswerSubmission({ ...validSubmission, isRateLimited: true }).accepted,
    false,
  );
});

test("normalizes answer comparison without exposing client-side correctness", () => {
  assert.equal(isCorrectAnswer("  MERCURY ", "Mercury"), true);
  assert.equal(isCorrectAnswer("Venus", "Mercury"), false);
  assert.equal(isCorrectAnswer(undefined, "Mercury"), false);
});

test("host migration selects the first connected non-bot player", () => {
  const players = ["🤖 Bot Alpha", "PlayerTwo", "PlayerThree"];
  const isBot = (username: string) => username.startsWith("🤖");

  assert.equal(selectNextHost(players, isBot), "PlayerTwo");
  assert.equal(selectNextHost(["🤖 Bot Alpha"], isBot), null);
});
