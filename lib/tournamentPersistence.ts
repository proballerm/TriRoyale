import clientPromise from "./mongodb";
import type { TournamentManagerState, TournamentPlayer, TournamentSnapshot } from "./tournamentManager";

const ACTIVE_COLLECTION = "active_tournaments";
const HISTORY_COLLECTION = "tournament_history";
const STATS_COLLECTION = "tournament_player_stats";
const ACTIVE_KEY = "global";

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
      $set: {
        key: ACTIVE_KEY,
        tournamentId: state.tournamentId,
        state,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
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
  const completedAt = new Date();

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
        completedAt,
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

async function updatePlayerStats(db: Awaited<ReturnType<typeof clientPromise.then>>["db"] extends never ? never : any, player: TournamentPlayer, champion: boolean): Promise<void> {
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
