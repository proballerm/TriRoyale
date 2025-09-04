import { hash } from "bcryptjs";
import clientPromise from "@/lib/mongodb";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { name, email, password } = await req.json();

  const client = await clientPromise;
  const db = client.db();

  const existing = await db.collection("users").findOne({ email });

  if (existing) {
    return NextResponse.json(
      { message: "User already exists" },
      { status: 409 }
    );
  }

  const hashed = await hash(password, 12);

  await db.collection("users").insertOne({
    name,
    email,
    password: hashed,
  });

  return NextResponse.json({ message: "User created" });
}
