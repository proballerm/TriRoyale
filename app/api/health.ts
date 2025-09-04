// /api/health
import { MongoClient } from "mongodb";
const client = new MongoClient(process.env.MONGODB_URI!);
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await client.connect();
    await client.db(process.env.MONGODB_DB).command({ ping: 1 });
    res.status(200).json({ ok: true });
  } catch (e:any) {
    console.error("HEALTH:", e?.message);
    res.status(500).json({ ok: false, error: e?.message });
  }
}
