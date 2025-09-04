import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function GET() {
  const client = await clientPromise;
  const db = client.db();

  const results = await db.collection("leaderboard")
    .find({})
    .sort({ wins: -1 })
    .limit(20)
    .toArray();

  return NextResponse.json(results);
}
