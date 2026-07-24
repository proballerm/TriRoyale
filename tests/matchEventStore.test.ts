import assert from "node:assert/strict";
import test from "node:test";
import { MatchEventStore } from "../lib/matchEventStore";

test("stores ordered match events with monotonic sequence numbers", () => {
  const store = new MatchEventStore();

  const joined = store.append("match-1", "player_joined", { username: "Prabal" }, 100);
  const started = store.append("match-1", "match_started", { category: "Sports" }, 200);

  assert.equal(joined.sequence, 1);
  assert.equal(started.sequence, 2);
  assert.deepEqual(store.list("match-1"), [joined, started]);
});

test("supports incremental replay after a known sequence", () => {
  const store = new MatchEventStore();
  store.append("match-1", "player_joined");
  store.append("match-1", "question_started");
  store.append("match-1", "round_completed");

  const replay = store.list("match-1", 1);
  assert.deepEqual(
    replay.map((event) => event.sequence),
    [2, 3],
  );
});

test("keeps only the configured number of recent events", () => {
  const store = new MatchEventStore(2);
  store.append("match-1", "player_joined");
  store.append("match-1", "match_started");
  store.append("match-1", "question_started");

  assert.deepEqual(
    store.list("match-1").map((event) => event.sequence),
    [2, 3],
  );
});

test("returns defensive copies so replay consumers cannot mutate state", () => {
  const store = new MatchEventStore();
  store.append("match-1", "answer_accepted", { username: "Prabal" });

  const replay = store.list("match-1");
  replay[0].payload.username = "Changed";

  assert.equal(store.list("match-1")[0].payload.username, "Prabal");
});

test("clears completed match history and validates configuration", () => {
  const store = new MatchEventStore();
  store.append("match-1", "match_completed");
  store.clear("match-1");

  assert.deepEqual(store.list("match-1"), []);
  assert.equal(store.getMatchCount(), 0);
  assert.throws(() => new MatchEventStore(0), /positive integer/);
});
