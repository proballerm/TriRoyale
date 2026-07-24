import assert from "node:assert/strict";
import test from "node:test";

import { MatchManager } from "../lib/matchManager";

test("creates a match in the lobby phase", () => {
  const manager = new MatchManager();
  const match = manager.create("match-1", "Sports");

  assert.equal(match.phase, "lobby");
  assert.equal(match.started, false);
  assert.equal(match.roundNumber, 0);
});

test("starts a match and tracks the start time", () => {
  const manager = new MatchManager();
  manager.create("match-1", "Sports");

  const match = manager.start("match-1", 1234);

  assert.equal(match.started, true);
  assert.equal(match.phase, "intermission");
  assert.equal(match.startedAt, 1234);
});

test("advances through question and intermission phases", () => {
  const manager = new MatchManager();
  manager.create("match-1", "Science");
  manager.start("match-1");

  const question = manager.beginQuestion("match-1", "question-1");
  assert.equal(question.phase, "question");
  assert.equal(question.currentQuestionId, "question-1");
  assert.equal(question.roundNumber, 1);

  const intermission = manager.beginIntermission("match-1");
  assert.equal(intermission.phase, "intermission");
  assert.equal(intermission.currentQuestionId, null);
});

test("completes a match with a winner", () => {
  const manager = new MatchManager();
  manager.create("match-1", "History");
  manager.start("match-1");

  const match = manager.complete("match-1", "Prabal", 9999);

  assert.equal(match.phase, "completed");
  assert.equal(match.winner, "Prabal");
  assert.equal(match.completedAt, 9999);
  assert.equal(manager.isActive("match-1"), false);
});

test("counts only active matches", () => {
  const manager = new MatchManager();
  manager.create("match-1", "Sports");
  manager.create("match-2", "Music");
  manager.start("match-1");
  manager.start("match-2");
  manager.complete("match-2", null);

  assert.equal(manager.getActiveCount(), 1);
});

test("protects internal state from snapshot mutation", () => {
  const manager = new MatchManager();
  const snapshot = manager.create("match-1", "Movies");
  snapshot.phase = "completed";

  assert.equal(manager.get("match-1")?.phase, "lobby");
});

test("rejects invalid lifecycle transitions", () => {
  const manager = new MatchManager();
  manager.create("match-1", "Geography");

  assert.throws(() => manager.beginQuestion("match-1", "q1"), /has not started/);
  manager.start("match-1");
  assert.throws(() => manager.start("match-1"), /already started/);
  assert.throws(() => manager.beginIntermission("match-1"), /must follow a question/);
});
