import assert from "node:assert/strict";
import test from "node:test";
import {
  FINAL_QUESTION_MULTIPLIER,
  TournamentDuelEngine,
  type DuelQuestion,
} from "../lib/tournamentDuelEngine";

const players: [string, string] = ["player-one", "player-two"];

function makeQuestions(): DuelQuestion[] {
  return [
    {
      id: "q1",
      category: "Sports",
      question: "Question one?",
      answers: ["A", "B", "C", "D"],
      correctAnswer: "A",
      timeLimit: 12,
    },
    {
      id: "q2",
      category: "Science",
      question: "Question two?",
      answers: ["A", "B", "C", "D"],
      correctAnswer: "B",
      timeLimit: 12,
    },
    {
      id: "q3",
      category: "History",
      question: "Question three?",
      answers: ["A", "B", "C", "D"],
      correctAnswer: "C",
      timeLimit: 12,
    },
  ];
}

function answerBoth(
  engine: TournamentDuelEngine,
  questionId: string,
  firstAnswer: string,
  secondAnswer: string,
  startedAt: number,
): void {
  engine.submitAnswer(players[0], questionId, firstAnswer, startedAt + 1_000);
  engine.submitAnswer(players[1], questionId, secondAnswer, startedAt + 2_000);
}

test("awards more points for a faster correct answer", () => {
  const engine = new TournamentDuelEngine("speed-duel", players, makeQuestions());
  const startedAt = 10_000;
  engine.startQuestion(startedAt);

  const fast = engine.submitAnswer(players[0], "q1", "A", startedAt + 1_000);
  const slow = engine.submitAnswer(players[1], "q1", "A", startedAt + 8_000);

  assert.equal(fast.accepted, true);
  assert.equal(slow.accepted, true);
  assert.equal(fast.correct, true);
  assert.equal(slow.correct, true);
  assert.ok(fast.points > slow.points);
});

test("locks each player to one answer per question", () => {
  const engine = new TournamentDuelEngine("duplicate-duel", players, makeQuestions());
  const startedAt = 20_000;
  engine.startQuestion(startedAt);

  const first = engine.submitAnswer(players[0], "q1", "A", startedAt + 1_500);
  const duplicate = engine.submitAnswer(players[0], "q1", "B", startedAt + 2_000);

  assert.equal(first.accepted, true);
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.points, first.points);
  assert.deepEqual(duplicate.score, first.score);
});

test("rejects mismatched question identifiers", () => {
  const engine = new TournamentDuelEngine("question-id-duel", players, makeQuestions());
  engine.startQuestion(25_000);

  assert.throws(
    () => engine.submitAnswer(players[0], "wrong-question", "A", 26_000),
    /active question/,
  );
});

test("scores answers beyond the grace window as incorrect", () => {
  const engine = new TournamentDuelEngine("deadline-duel", players, makeQuestions());
  const startedAt = 30_000;
  engine.startQuestion(startedAt);

  const result = engine.submitAnswer(players[0], "q1", "A", startedAt + 12_251);

  assert.equal(result.accepted, true);
  assert.equal(result.correct, false);
  assert.equal(result.points, 0);
});

test("applies the double-points multiplier only to the final question", () => {
  const engine = new TournamentDuelEngine("multiplier-duel", players, makeQuestions());

  let startedAt = 40_000;
  engine.startQuestion(startedAt);
  const first = engine.submitAnswer(players[0], "q1", "A", startedAt + 1_000);
  engine.submitAnswer(players[1], "q1", "D", startedAt + 1_500);
  assert.equal(first.multiplier, 1);

  engine.advanceQuestion();
  startedAt += 20_000;
  engine.startQuestion(startedAt);
  answerBoth(engine, "q2", "B", "D", startedAt);

  engine.advanceQuestion();
  startedAt += 20_000;
  engine.startQuestion(startedAt);
  const final = engine.submitAnswer(players[0], "q3", "C", startedAt + 1_000);

  assert.equal(final.multiplier, FINAL_QUESTION_MULTIPLIER);
  assert.equal(final.points, first.points * FINAL_QUESTION_MULTIPLIER);
});

test("restores an active duel without losing timer, answers, or scores", () => {
  const engine = new TournamentDuelEngine("restore-duel", players, makeQuestions());
  const startedAt = 50_000;
  engine.startQuestion(startedAt);
  engine.submitAnswer(players[0], "q1", "A", startedAt + 1_000);

  const restored = TournamentDuelEngine.restore(engine.exportState());

  assert.equal(restored.hasAnswered(players[0]), true);
  assert.equal(restored.hasAnswered(players[1]), false);
  assert.deepEqual(restored.getScores(), engine.getScores());
  assert.equal(restored.getQuestionStartedAt(), startedAt);
  assert.equal(restored.getQuestionDeadline(), startedAt + 12_000);

  const duplicate = restored.submitAnswer(players[0], "q1", "D", startedAt + 2_000);
  assert.equal(duplicate.accepted, false);
});

test("selects the higher score as the winner after the final question", () => {
  const engine = new TournamentDuelEngine("winner-duel", players, makeQuestions());

  let startedAt = 60_000;
  engine.startQuestion(startedAt);
  answerBoth(engine, "q1", "A", "D", startedAt);

  engine.advanceQuestion();
  startedAt += 20_000;
  engine.startQuestion(startedAt);
  answerBoth(engine, "q2", "B", "D", startedAt);

  engine.advanceQuestion();
  startedAt += 20_000;
  engine.startQuestion(startedAt);
  answerBoth(engine, "q3", "C", "D", startedAt);
  engine.advanceQuestion();

  assert.equal(engine.isComplete(), true);
  assert.equal(engine.getWinnerId(), players[0]);
});

test("uses total response time when score and accuracy are tied", () => {
  const engine = new TournamentDuelEngine("response-time-duel", players, [makeQuestions()[0]]);
  const startedAt = 70_000;
  engine.startQuestion(startedAt);
  engine.submitAnswer(players[0], "q1", "D", startedAt + 1_000);
  engine.submitAnswer(players[1], "q1", "D", startedAt + 2_000);
  engine.advanceQuestion();

  assert.equal(engine.getWinnerId(), players[0]);
});

test("uses a stable final tiebreak for identical duel results", () => {
  const firstEngine = new TournamentDuelEngine("stable-tie-duel", players, makeQuestions());
  const secondEngine = new TournamentDuelEngine("stable-tie-duel", players, makeQuestions());

  for (const engine of [firstEngine, secondEngine]) {
    let startedAt = 80_000;
    for (const question of makeQuestions()) {
      engine.startQuestion(startedAt);
      engine.submitAnswer(players[0], question.id, "D", startedAt + 1_000);
      engine.submitAnswer(players[1], question.id, "D", startedAt + 1_000);
      engine.advanceQuestion();
      startedAt += 20_000;
    }
  }

  assert.equal(firstEngine.getWinnerId(), secondEngine.getWinnerId());
  assert.ok(players.includes(firstEngine.getWinnerId()));
});
