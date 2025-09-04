import clientPromise from "./mongodb";

export async function getTriviaCollection() {
  const client = await clientPromise;
  const db = client.db(); // or specify db name: client.db("trivia-db")
  return db.collection("triviaquestions");
}
