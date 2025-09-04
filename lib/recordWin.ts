// lib/recordWin.ts
import clientPromise from "./mongodb";

export async function recordWin(username: string, category: string, io?: any) {
  const client = await clientPromise;
  const db = client.db(); // or specify db name
  const collection = db.collection("leaderboard");

  await collection.updateOne(
    { username, category },
    { $inc: { wins: 1 } },
    { upsert: true }
  );

  // Real-time leaderboard update
  if (io) {
    io.emit("leaderboardUpdated");
  }
}
