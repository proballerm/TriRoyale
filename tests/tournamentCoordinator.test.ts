import assert from "node:assert/strict";
import test from "node:test";
import { TournamentCoordinator } from "../lib/tournamentCoordinator";

test("joins a human and immediately backfills with a bot", () => {
  const coordinator = new TournamentCoordinator("coordinator-1", 8, () => 0.5);
  const result = coordinator.join("user-1", "Prabal M.");

  assert.equal(result.status, "matched");
  if (result.status !== "matched") return;

  assert.equal(result.match.player.id, "user-1");
  assert.equal(result.match.opponent.kind, "bot");
  assert.equal(result.match.tournament.startingPlayers, 8);
  assert.equal(result.match.duel.questionCount, 3);
});

test("returns the same active duel when a player reconnects", () => {
  const coordinator = new TournamentCoordinator("coordinator-2", 8, () => 0.5);
  const first = coordinator.join("user-1", "Maya R.");
  const second = coordinator.join("user-1", "Maya R.");

  assert.equal(first.status, "matched");
  assert.equal(second.status, "matched");
  if (first.status !== "matched" || second.status !== "matched") return;

  assert.equal(second.match.duel.id, first.match.duel.id);
  assert.equal(second.match.opponent.id, first.match.opponent.id);
});

test("completes the live duel and simulates every other match in that round", () => {
  const coordinator = new TournamentCoordinator("coordinator-3", 8, () => 0.5);
  const joined = coordinator.join("user-1", "Ava K.");
  assert.equal(joined.status, "matched");
  if (joined.status !== "matched") return;

  const completed = coordinator.completeMatch(joined.match.duel.id, "user-1");

  assert.equal(completed.winner.id, "user-1");
  assert.equal(completed.winner.wins, 1);
  assert.equal(completed.loser.status, "eliminated");
  assert.equal(completed.background.duelsCompleted, 3);
  assert.equal(completed.tournament.remainingPlayers, 4);
  assert.equal(completed.tournament.round, 2);
  assert.ok(completed.nextMatch);
  assert.equal(completed.nextMatch?.player.id, "user-1");
  assert.equal(completed.nextMatch?.duel.round, 2);
});

test("reduces a 1000-player field to 500 after the opening round", () => {
  const coordinator = new TournamentCoordinator("coordinator-1000", 1000, () => 0.25);
  const joined = coordinator.join("user-1", "Prabal M.");
  assert.equal(joined.status, "matched");
  if (joined.status !== "matched") return;

  const completed = coordinator.completeMatch(joined.match.duel.id, "user-1");

  assert.equal(completed.background.duelsCompleted, 499);
  assert.equal(completed.background.botsEliminated, 499);
  assert.equal(completed.tournament.remainingPlayers, 500);
  assert.equal(completed.tournament.round, 2);
  assert.equal(completed.nextMatch?.duel.round, 2);
});

test("does not expose completed duels as active matches", () => {
  const coordinator = new TournamentCoordinator("coordinator-4", 4, () => 0.5);
  const joined = coordinator.join("user-1", "Noah T.");
  assert.equal(joined.status, "matched");
  if (joined.status !== "matched") return;

  const opponentId = joined.match.opponent.id;
  coordinator.completeMatch(joined.match.duel.id, "user-1");

  assert.equal(coordinator.getMatchForPlayer(opponentId), null);
});

test("rejects completing an unknown duel", () => {
  const coordinator = new TournamentCoordinator("coordinator-5", 4, () => 0.5);

  assert.throws(
    () => coordinator.completeMatch("missing-duel", "user-1"),
    /Duel not found/,
  );
});

test("resets to a fresh 1000-player tournament", () => {
  const coordinator = new TournamentCoordinator("coordinator-6", 4, () => 0.5);
  coordinator.join("user-1", "Leah V.");

  const snapshot = coordinator.reset("coordinator-reset");

  assert.equal(snapshot.id, "coordinator-reset");
  assert.equal(snapshot.startingPlayers, 1000);
  assert.equal(snapshot.remainingPlayers, 1000);
  assert.equal(snapshot.queuedBots, 1000);
  assert.equal(coordinator.getPlayer("user-1"), null);
});
