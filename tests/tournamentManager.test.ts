import assert from "node:assert/strict";
import test from "node:test";
import {
  QUESTIONS_PER_DUEL,
  TOURNAMENT_STARTING_PLAYERS,
  TournamentManager,
} from "../lib/tournamentManager";

test("creates every tournament with exactly 1000 players", () => {
  const manager = new TournamentManager("tournament-1", TOURNAMENT_STARTING_PLAYERS, () => 0.5);
  const snapshot = manager.getSnapshot();
  assert.equal(snapshot.startingPlayers, 1000);
  assert.equal(snapshot.remainingPlayers, 1000);
  assert.equal(snapshot.queuedBots, 1000);
  assert.equal(snapshot.queuedHumans, 0);
});

test("replaces queued bots when real players join", () => {
  const manager = new TournamentManager("tournament-2", 10, () => 0.5);
  const player = manager.addHuman("user-1", "  Prabal   M  ");
  const snapshot = manager.getSnapshot();
  assert.equal(player.displayName, "Prabal M");
  assert.equal(player.kind, "human");
  assert.equal(snapshot.remainingPlayers, 10);
  assert.equal(snapshot.queuedHumans, 1);
  assert.equal(snapshot.queuedBots, 9);
});

test("prioritizes matching two real players before using a bot", () => {
  const manager = new TournamentManager("tournament-3", 10, () => 0.5);
  manager.addHuman("user-1", "Maya K.");
  manager.addHuman("user-2", "Ryan S.");
  const duel = manager.createNextDuel();
  assert.ok(duel);
  assert.deepEqual(new Set([duel.playerOneId, duel.playerTwoId]), new Set(["user-1", "user-2"]));
  assert.equal(duel.questionCount, QUESTIONS_PER_DUEL);
});

test("backfills a human matchup with a realistic bot when needed", () => {
  const manager = new TournamentManager("tournament-4", 10, () => 0.5);
  manager.addHuman("user-1", "Ava R.");
  const duel = manager.createNextDuel();
  assert.ok(duel);
  const opponentId = duel.playerOneId === "user-1" ? duel.playerTwoId : duel.playerOneId;
  const opponent = manager.getPlayer(opponentId);
  assert.equal(opponent?.kind, "bot");
  assert.match(opponent?.displayName || "", /^[A-Z][a-z]+ [A-Z]\.?(?: \d+)?$/);
  assert.equal(opponent?.displayName.includes("Bot"), false);
});

test("eliminates the loser and automatically requeues the winner", () => {
  const manager = new TournamentManager("tournament-5", 4, () => 0.5);
  manager.addHuman("user-1", "Noah T.");
  const duel = manager.createNextDuel();
  assert.ok(duel);
  manager.completeDuel(duel.id, "user-1");
  const winner = manager.getPlayer("user-1");
  const loserId = duel.playerOneId === "user-1" ? duel.playerTwoId : duel.playerOneId;
  const loser = manager.getPlayer(loserId);
  const snapshot = manager.getSnapshot();
  assert.equal(winner?.status, "queued");
  assert.equal(winner?.wins, 1);
  assert.equal(winner?.round, 2);
  assert.equal(loser?.status, "eliminated");
  assert.equal(snapshot.remainingPlayers, 3);
  assert.equal(snapshot.queuedHumans, 1);
});

test("grants one bot a bye when an odd round has no live match left", () => {
  const manager = new TournamentManager("tournament-bye", 5, () => 0.5);
  manager.addHuman("user-1", "Kai R.");
  const humanDuel = manager.createNextDuel();
  assert.ok(humanDuel);
  manager.completeDuel(humanDuel.id, "user-1");
  const simulation = manager.simulateQueuedBotDuels();
  const snapshot = manager.getSnapshot();
  assert.equal(simulation.duelsCompleted, 1);
  assert.equal(simulation.byesGranted, 1);
  assert.equal(simulation.remainingPlayers, 3);
  assert.equal(snapshot.round, 2);
});

test("does not grant a bye while a live duel from that round is active", () => {
  const manager = new TournamentManager("tournament-active-bye", 5, () => 0.5);
  manager.addHuman("user-1", "Mia L.");
  const humanDuel = manager.createNextDuel();
  assert.ok(humanDuel);
  const simulation = manager.simulateQueuedBotDuels();
  assert.equal(simulation.duelsCompleted, 1);
  assert.equal(simulation.byesGranted, 0);
  assert.equal(manager.getSnapshot().round, 1);
});

test("rejects a winner who was not part of the duel", () => {
  const manager = new TournamentManager("tournament-6", 4, () => 0.5);
  const duel = manager.createNextDuel();
  assert.ok(duel);
  assert.throws(() => manager.completeDuel(duel.id, "not-in-this-duel"), /Winner must be a player in the duel/);
});

test("protects tournament state from mutation by callers", () => {
  const manager = new TournamentManager("tournament-7", 4, () => 0.5);
  const player = manager.addHuman("user-1", "Leah V.");
  player.displayName = "Changed";
  assert.equal(manager.getPlayer("user-1")?.displayName, "Leah V.");
});

test("exports and restores active players, queues, duels, and rounds", () => {
  const manager = new TournamentManager("persistent-tournament", 8, () => 0.5);
  manager.addHuman("user-1", "Prabal M.");
  const duel = manager.createNextDuel();
  assert.ok(duel);

  const restored = TournamentManager.fromState(manager.exportState(), () => 0.5);
  const restoredDuel = restored.getDuel(duel.id);

  assert.deepEqual(restored.getSnapshot(), manager.getSnapshot());
  assert.equal(restored.getPlayer("user-1")?.displayName, "Prabal M.");
  assert.equal(restoredDuel?.winnerId, null);
  assert.deepEqual(
    new Set([restoredDuel?.playerOneId, restoredDuel?.playerTwoId]),
    new Set([duel.playerOneId, duel.playerTwoId]),
  );
});
