// app/api/health/route.ts
import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI!;
const client = new MongoClient(uri);

export async function GET() {
  try {
    await client.connect();
    await client.db(process.env.MONGODB_DB!).command({ ping: 1 });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error("HEALTH:", e?.message);
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
