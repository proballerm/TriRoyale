import { NextResponse } from "next/server";
import { getTournamentHistory } from "@/lib/tournamentPersistence";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") || 20);
    const history = await getTournamentHistory(Number.isFinite(requestedLimit) ? requestedLimit : 20);
    return NextResponse.json(history, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[Tournament History API] Failed to load history", error);
    return NextResponse.json({ message: "Tournament history could not be loaded." }, { status: 500 });
  }
}
