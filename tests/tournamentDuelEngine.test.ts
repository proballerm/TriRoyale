import assert from "node:assert/strict";
import test from "node:test";
import { TournamentDuelEngine } from "../lib/tournamentDuelEngine";

const questions = [
  {
    id: "q1",
    category: "Science",
    question: "Which planet is known as the Red Planet?",
    answers: ["Earth", "Mars", "Venus", "Jupiter"],
    correctAnswer: "Mars",
    timeLimit: 12,
  },
  {
    id: "q2",
    category: "History",
    question: "Which civilization built Machu Picchu?",
    answers: ["Roman", "Maya", "Inca", "Greek"],
    correctAnswer: "Inca",
    timeLimit: 12,
  },
];

test("awards correctness and speed points server-side", () => {
  const duel = new TournamentDuelEngine("duel-1", ["p1", "p2"], questions);
  duel.startQuestion(1_000);

  const fast = duel.submitAnswer("p1", "q1", "Mars", 2_000);
  const slow = duel.submitAnswer("p2", "q1", "Mars", 10_000);

  assert.equal(fast.correct, true);
  assert.equal(slow.correct, true);
  assert.ok(fast.points > slow.points);
  assert.equal(fast.score.correctAnswers, 1);
});

test("locks each player to one answer per question", () => {
  const duel = new TournamentDuelEngine("duel-2", ["p1", "p2"], questions);
  duel.startQuestion(1_000);

  const first = duel.submitAnswer("p1", "q1", "Earth", 2_000);
  const replay = duel.submitAnswer("p1", "q1", "Mars", 2_500);

  assert.equal(first.accepted, true);
  assert.equal(first.correct, false);
  assert.equal(replay.accepted, false);
  assert.equal(replay.correct, false);
  assert.equal(duel.getScore("p1").score, 0);
});

test("rejects mismatched question identifiers", () => {
  const duel = new TournamentDuelEngine("duel-3", ["p1", "p2"], questions);
  duel.startQuestion(1_000);

  assert.throws(
    () => duel.submitAnswer("p1", "wrong-question", "Mars", 2_000),
    /active question/,
  );
});

test("advances through all questions and selects the higher score", () => {
  const duel = new TournamentDuelEngine("duel-4", ["p1", "p2"], questions);
  duel.startQuestion(1_000);
  duel.submitAnswer("p1", "q1", "Mars", 2_000);
  duel.submitAnswer("p2", "q1", "Earth", 2_000);

  assert.equal(duel.isQuestionComplete(), true);
  assert.equal(duel.advanceQuestion()?.id, "q2");

  duel.startQuestion(20_000);
  duel.submitAnswer("p1", "q2", "Inca", 21_000);
  duel.submitAnswer("p2", "q2", "Inca", 24_000);
  assert.equal(duel.advanceQuestion(), null);
  assert.equal(duel.isComplete(), true);
  assert.equal(duel.getWinnerId(), "p1");
});

test("uses total response time as a tie breaker", () => {
  const duel = new TournamentDuelEngine("duel-5", ["p1", "p2"], [questions[0]]);
  duel.startQuestion(1_000);
  duel.submitAnswer("p1", "q1", "Earth", 2_000);
  duel.submitAnswer("p2", "q1", "Venus", 3_000);
  duel.advanceQuestion();

  assert.equal(duel.getWinnerId(), "p1");
});
