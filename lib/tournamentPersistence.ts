import type { Db } from "mongodb";
import clientPromise from "./mongodb";
import type { TournamentDuelEngineState } from "./tournamentDuelEngine";
import type { TournamentManagerState, TournamentPlayer, TournamentSnapshot } from "./tournamentManager";

const ACTIVE_COLLECTION = "active_tournaments";
const ACTIVE_DUELS_COLLECTION = "active_tournament_duels";
const HISTORY_COLLECTION = "tournament_history";
const STATS_COLLECTION = "tournament_player_stats";
const ACTIVE_KEY = "global";

export type TournamentHistoryEntry = {
  tournamentId: string;
  champion: TournamentPlayer;
  startingPlayers: number;
  rounds: number;
  humanParticipants: Array<{ id: string; displayName: string; wins: number }>;
  totalMatches: number;
  completedAt: Date;
};

export type TournamentPlayerStats = {
  playerId: string;
  displayName: string;
  tournamentsPlayed: number;
  tournamentWins: number;
  duelsWon: number;
  roundsSurvived: number;
  longestTournamentRun: number;
  updatedAt?: Date;
};

export async function loadActiveTournament(): Promise<TournamentManagerState | null> {
  const client = await clientPromise;
  const document = await client.db().collection(ACTIVE_COLLECTION).findOne<{ state: TournamentManagerState }>({ key: ACTIVE_KEY });
  return document?.state ?? null;
}

export async function saveActiveTournament(state: TournamentManagerState): Promise<void> {
  const client = await clientPromise;
  await client.db().collection(ACTIVE_COLLECTION).updateOne(
    { key: ACTIVE_KEY },
    {
      $set: { key: ACTIVE_KEY, tournamentId: state.tournamentId, state, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
}

export async function loadActiveDuelSessions(tournamentId: string): Promise<TournamentDuelEngineState[]> {
  const client = await clientPromise;
  return client.db().collection<{ tournamentId: string; duelId: string; state: TournamentDuelEngineState }>(ACTIVE_DUELS_COLLECTION)
    .find({ tournamentId })
    .map((document) => document.state)
    .toArray();
}

export async function saveActiveDuelSession(tournamentId: string, state: TournamentDuelEngineState): Promise<void> {
  const client = await clientPromise;
  await client.db().collection(ACTIVE_DUELS_COLLECTION).updateOne(
    { tournamentId, duelId: state.duelId },
    {
      $set: { tournamentId, duelId: state.duelId, state, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
}

export async function deleteActiveDuelSession(tournamentId: string, duelId: string): Promise<void> {
  const client = await clientPromise;
  await client.db().collection(ACTIVE_DUELS_COLLECTION).deleteOne({ tournamentId, duelId });
}

export async function clearActiveDuelSessions(tournamentId: string): Promise<void> {
  const client = await clientPromise;
  await client.db().collection(ACTIVE_DUELS_COLLECTION).deleteMany({ tournamentId });
}

export async function getTournamentHistory(limit = 20): Promise<TournamentHistoryEntry[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const client = await clientPromise;
  return client.db().collection<TournamentHistoryEntry>(HISTORY_COLLECTION)
    .find({}, { projection: { _id: 0 } })
    .sort({ completedAt: -1 })
    .limit(safeLimit)
    .toArray();
}

export async function getTournamentPlayerStats(playerId: string): Promise<TournamentPlayerStats | null> {
  const safePlayerId = playerId.trim().slice(0, 100);
  if (!safePlayerId) return null;
  const client = await clientPromise;
  return client.db().collection<TournamentPlayerStats>(STATS_COLLECTION).findOne(
    { playerId: safePlayerId },
    { projection: { _id: 0 } },
  );
}

export async function getTournamentStatsLeaderboard(limit = 25): Promise<TournamentPlayerStats[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const client = await clientPromise;
  return client.db().collection<TournamentPlayerStats>(STATS_COLLECTION)
    .find({}, { projection: { _id: 0 } })
    .sort({ tournamentWins: -1, duelsWon: -1, longestTournamentRun: -1 })
    .limit(safeLimit)
    .toArray();
}

export async function archiveCompletedTournament(
  state: TournamentManagerState,
  snapshot: TournamentSnapshot,
): Promise<void> {
  if (!snapshot.champion) return;
  const client = await clientPromise;
  const db = client.db();
  const humans = state.players.filter((player) => player.kind === "human");
  const completedDuels = state.duels.filter((duel) => duel.winnerId);

  await db.collection(HISTORY_COLLECTION).updateOne(
    { tournamentId: state.tournamentId },
    {
      $setOnInsert: {
        tournamentId: state.tournamentId,
        champion: snapshot.champion,
        startingPlayers: state.startingPlayers,
        rounds: snapshot.round,
        humanParticipants: humans.map(({ id, displayName, wins }) => ({ id, displayName, wins })),
        totalMatches: completedDuels.length,
        completedAt: new Date(),
      },
    },
    { upsert: true },
  );

  await Promise.all(humans.map((player) => updatePlayerStats(db, player, snapshot.champion?.id === player.id)));
}

export async function clearActiveTournament(): Promise<void> {
  const client = await clientPromise;
  await client.db().collection(ACTIVE_COLLECTION).deleteOne({ key: ACTIVE_KEY });
}

async function updatePlayerStats(db: Db, player: TournamentPlayer, champion: boolean): Promise<void> {
  await db.collection(STATS_COLLECTION).updateOne(
    { playerId: player.id },
    {
      $set: { displayName: player.displayName, updatedAt: new Date() },
      $inc: {
        tournamentsPlayed: 1,
        tournamentWins: champion ? 1 : 0,
        duelsWon: player.wins,
        roundsSurvived: Math.max(0, player.round - 1),
      },
      $max: { longestTournamentRun: player.wins },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
}
