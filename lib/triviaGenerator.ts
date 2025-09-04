// lib/generateTriviaQuestion.ts
import OpenAI from "openai";
import "dotenv/config";
import { gradeCreativity } from "./gradeCreativity";
import { getTriviaCollection } from "./triviaCollection";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Tunables (env overrides)
const COOLDOWN_MINUTES = Number(process.env.QUESTION_COOLDOWN_MINUTES ?? "120"); // cannot be reused within this time
const RESERVE_SECONDS  = Number(process.env.QUESTION_RESERVE_SECONDS  ?? "60");  // short hold while round starts

function toLetter(answers: string[], correctText: string): "A" | "B" | "C" | "D" {
  const idx = answers.findIndex(
    a => a?.trim().toLowerCase() === correctText?.trim().toLowerCase()
  );
  const safeIdx = idx >= 0 ? idx : 0;
  return String.fromCharCode(65 + safeIdx) as "A" | "B" | "C" | "D";
}

export async function generateTriviaQuestion(category: string) {
  const actualCategory =
    category === "Battle Royale"
      ? ["Sports","Science","Movies","History","Geography","Music"][Math.floor(Math.random()*6)]
      : category;

  const collection = await getTriviaCollection();

  const now = new Date();
  const cooldownCutoff = new Date(now.getTime() - COOLDOWN_MINUTES * 60_000);
  const reserveUntil   = new Date(now.getTime() + RESERVE_SECONDS * 1_000);

  // ============
  // 1) BANK FIRST (prioritize not-recently-used)
  //    - same category
  //    - either never used OR lastUsedAt <= cutoff
  //    - not currently reserved by another match
  //    - pick the stalest first (oldest lastUsedAt, then lowest useCount)
  // ============
  const existing = await collection.findOneAndUpdate(
    {
      category: actualCategory,
      $and: [
        { $or: [{ lastUsedAt: { $exists: false } }, { lastUsedAt: { $lte: cooldownCutoff } }] },
        { $or: [{ reservedUntil: { $exists: false } }, { reservedUntil: { $lte: now } }] },
      ],
    },
    {
      $set: { lastUsedAt: now, reservedUntil: reserveUntil },
      $inc: { useCount: 1 },
      $unset: { used: "" }, // legacy flag no longer used
    },
    {
      sort: { lastUsedAt: 1, useCount: 1, _id: 1 },
      returnDocument: "after",
    }
  );

  if (existing?.value) {
    const doc = existing.value as { question: string; answers: string[]; correct: string };

    // Optional: shuffle answers on reuse for variety
    const shuffled = [...doc.answers].sort(() => Math.random() - 0.5);
    const correctLetter = toLetter(shuffled, doc.correct);

    return { question: doc.question, answers: shuffled, correct: correctLetter };
  }

  // ============
  // 2) GENERATE (only if no eligible banked question)
  // ============
  for (let attempt = 0; attempt < 20; attempt++) {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 1.2,
      messages: [
        { role: "system", content: "You are a trivia question generator." },
        {
          role: "user",
          content: `Generate a trivia question like Trivia Crack/Royale. Topic: "${actualCategory}".
Return STRICT JSON:
{
  "question": "Your trivia question?",
  "answers": ["A","B","C","D"],
  "correct": "A"
}
- Answers short (1–5 words)
- No textbook tone; allow pop culture/twists`,
        },
      ],
    });

    const raw = completion.choices[0].message.content || "";
    const cleaned = raw
      .replace(/^```json/i, "").replace(/```$/i, "")
      .replace(/[\x00-\x1F\x7F]/g, "")
      .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
      .trim();

    let parsed: any;
    try { parsed = JSON.parse(cleaned); } catch { continue; }

    const questionText: string | undefined = parsed.question?.trim();
    const answers: string[] | undefined = Array.isArray(parsed.answers)
      ? parsed.answers.map((a: string) => a?.trim())
      : undefined;
    const idx = ["A","B","C","D"].indexOf(parsed.correct?.trim()?.toUpperCase());
    const correctText = answers?.[idx];

    if (!questionText || !answers || answers.length !== 4 || !correctText) continue;

    const creativity = await gradeCreativity(questionText, answers);
    if (creativity < 5) continue;

    // Store as TEXT; track reuse metadata
    await collection.insertOne({
      category: actualCategory,
      question: questionText,
      answers,
      correct: correctText,    // TEXT in DB
      lastUsedAt: now,         // first use now (starts cooldown)
      reservedUntil: reserveUntil,
      useCount: 1,
    });

    // Shuffle for gameplay; return LETTER
    const shuffled = [...answers].sort(() => Math.random() - 0.5);
    const correctLetter = toLetter(shuffled, correctText);

    return { question: questionText, answers: shuffled, correct: correctLetter };
  }

  throw new Error("Failed to produce a question (bank empty + generation rejected).");
}
