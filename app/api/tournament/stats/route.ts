import { NextResponse } from "next/server";
import {
  getTournamentPlayerStats,
  getTournamentStatsLeaderboard,
} from "@/lib/tournamentPersistence";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const playerId = url.searchParams.get("playerId")?.trim();

    if (playerId) {
      const stats = await getTournamentPlayerStats(playerId);
      return NextResponse.json(stats, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const requestedLimit = Number(url.searchParams.get("limit") || 25);
    const leaderboard = await getTournamentStatsLeaderboard(
      Number.isFinite(requestedLimit) ? requestedLimit : 25,
    );
    return NextResponse.json(leaderboard, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[Tournament Stats API] Failed to load stats", error);
    return NextResponse.json({ message: "Tournament statistics could not be loaded." }, { status: 500 });
  }
}
