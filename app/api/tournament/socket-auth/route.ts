import { authOptions } from "@/lib/authOptions";
import { createTournamentSocketToken } from "@/lib/tournamentSocketToken";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) {
    return NextResponse.json(
      { error: "You must be signed in to play in the tournament." },
      { status: 401 },
    );
  }

  const displayName =
    session.user?.name?.trim() || email.split("@")[0] || "Player";

  return NextResponse.json(
    {
      token: createTournamentSocketToken(email, displayName),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
