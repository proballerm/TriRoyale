import assert from "node:assert/strict";
import test from "node:test";

import { LobbyManager } from "../lib/lobbyManager";

const createManager = () =>
  new LobbyManager((username) => username.startsWith("🤖"));

test("assigns the first non-bot player as host", () => {
  const manager = createManager();

  manager.join("match-1", "🤖Bot_1");
  const result = manager.join("match-1", "Prabal");

  assert.equal(result.host, "Prabal");
  assert.deepEqual(result.players, ["🤖Bot_1", "Prabal"]);
});

test("does not add duplicate players", () => {
  const manager = createManager();

  assert.equal(manager.join("match-1", "Prabal").joined, true);
  assert.equal(manager.join("match-1", "Prabal").joined, false);
  assert.equal(manager.getPlayerCount("match-1"), 1);
});

test("migrates host to the first remaining non-bot player", () => {
  const manager = createManager();

  manager.join("match-1", "Prabal");
  manager.join("match-1", "Alex");
  manager.join("match-1", "🤖Bot_1");

  const result = manager.leave("match-1", "Prabal");

  assert.equal(result.hostChanged, true);
  assert.equal(result.host, "Alex");
  assert.deepEqual(result.players, ["Alex", "🤖Bot_1"]);
});

test("sets host to null when only bots remain", () => {
  const manager = createManager();

  manager.join("match-1", "Prabal");
  manager.join("match-1", "🤖Bot_1");

  const result = manager.leave("match-1", "Prabal");

  assert.equal(result.host, null);
  assert.equal(result.hostChanged, true);
});

test("returns defensive lobby snapshots", () => {
  const manager = createManager();
  manager.join("match-1", "Prabal");

  const snapshot = manager.snapshot("match-1");
  snapshot.players.push("Injected");

  assert.deepEqual(manager.snapshot("match-1").players, ["Prabal"]);
});

test("tracks total players across matches and supports reset", () => {
  const manager = createManager();

  manager.join("match-1", "Prabal");
  manager.join("match-2", "Alex");
  assert.equal(manager.getTotalPlayerCount(), 2);

  manager.reset("match-1");
  assert.equal(manager.getTotalPlayerCount(), 1);
  assert.deepEqual(manager.snapshot("match-1"), {
    matchId: "match-1",
    players: [],
    host: null,
  });
});

test("rejects empty match ids and usernames", () => {
  const manager = createManager();

  assert.throws(() => manager.join("", "Prabal"), /matchId is required/);
  assert.throws(() => manager.join("match-1", "   "), /username is required/);
});
