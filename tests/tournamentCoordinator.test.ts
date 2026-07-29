import assert from "node:assert/strict";
import test from "node:test";
import { TournamentCoordinator, TournamentJoinResult } from "../lib/tournamentCoordinator";

function joinWithBot(
  coordinator: TournamentCoordinator,
  playerId: string,
  displayName: string,
): Extract<TournamentJoinResult, { status: "matched" }> {
  const queued = coordinator.join(playerId, displayName);
  assert.equal(queued.status, "queued");
  const matched = coordinator.join(playerId, displayName);
  assert.equal(matched.status, "matched");
  if (matched.status !== "matched") throw new Error("Expected bot fallback match");
  return matched;
}

test("queues a lone human before falling back to a bot", () => {
  const coordinator = new TournamentCoordinator("coordinator-1", 8, () => 0.5);
  const queued = coordinator.join("user-1", "Prabal M.");

  assert.equal(queued.status, "queued");
  assert.equal(coordinator.getSnapshot().queuedHumans, 1);
  assert.equal(coordinator.getSnapshot().activeDuels, 0);

  const matched = coordinator.join("user-1", "Prabal M.");
  assert.equal(matched.status, "matched");
  if (matched.status !== "matched") return;
  assert.equal(matched.match.player.id, "user-1");
  assert.equal(matched.match.opponent.kind, "bot");
  assert.equal(matched.match.duel.questionCount, 3);
});

test("matches two humans before either receives a bot", () => {
  const coordinator = new TournamentCoordinator("coordinator-human-first", 8, () => 0.5);
  const first = coordinator.join("user-1", "Maya R.");
  const second = coordinator.join("user-2", "Ryan S.");

  assert.equal(first.status, "queued");
  assert.equal(second.status, "matched");
  if (second.status !== "matched") return;
  assert.equal(second.match.opponent.id, "user-1");
  assert.equal(second.match.opponent.kind, "human");
  assert.equal(coordinator.getMatchForPlayer("user-1")?.opponent.id, "user-2");
});

test("returns the same active duel when a player reconnects", () => {
  const coordinator = new TournamentCoordinator("coordinator-2", 8, () => 0.5);
  const first = joinWithBot(coordinator, "user-1", "Maya R.");
  const second = coordinator.join("user-1", "Maya R.");

  assert.equal(second.status, "matched");
  if (second.status !== "matched") return;
  assert.equal(second.match.duel.id, first.match.duel.id);
  assert.equal(second.match.opponent.id, first.match.opponent.id);
});

test("exposes active pairings and recent results to spectators", () => {
  const coordinator = new TournamentCoordinator("coordinator-spectator", 8, () => 0.5);
  const joined = joinWithBot(coordinator, "user-1", "Ava K.");

  const liveFeed = coordinator.getSpectatorState();
  assert.equal(liveFeed.activeDuels.length, 1);
  assert.equal(liveFeed.activeDuels[0].playerOne.id === "user-1" || liveFeed.activeDuels[0].playerTwo.id === "user-1", true);
  assert.equal(liveFeed.recentResults.length, 0);

  coordinator.completeMatch(joined.match.duel.id, "user-1");
  const completedFeed = coordinator.getSpectatorState();
  assert.equal(completedFeed.recentResults[0].winner?.id, "user-1");
  assert.equal(completedFeed.tournament.remainingPlayers, 4);
});

test("completes the live duel and simulates every other match in that round", () => {
  const coordinator = new TournamentCoordinator("coordinator-3", 8, () => 0.5);
  const joined = joinWithBot(coordinator, "user-1", "Ava K.");
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
  const joined = joinWithBot(coordinator, "user-1", "Prabal M.");
  const completed = coordinator.completeMatch(joined.match.duel.id, "user-1");

  assert.equal(completed.background.duelsCompleted, 499);
  assert.equal(completed.background.botsEliminated, 499);
  assert.equal(completed.tournament.remainingPlayers, 500);
  assert.equal(completed.tournament.round, 2);
  assert.equal(completed.nextMatch?.duel.round, 2);
});

test("does not expose completed duels as active matches", () => {
  const coordinator = new TournamentCoordinator("coordinator-4", 4, () => 0.5);
  const joined = joinWithBot(coordinator, "user-1", "Noah T.");
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
