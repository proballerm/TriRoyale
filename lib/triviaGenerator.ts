import OpenAI from "openai";
import "dotenv/config";
import { gradeCreativity } from "./gradeCreativity";
import clientPromise from "./mongodb";
import { getTriviaCollection } from "./triviaCollection";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateTriviaQuestion(category: string) {
  const actualCategory =
    category === "Battle Royale"
      ? ["Sports", "Science", "Movies", "History", "Geography", "Music"][
          Math.floor(Math.random() * 6)
        ]
      : category;

  // ✅ Get collection
  const collection = await getTriviaCollection();

  // 🔍 1. Try loading an unused question from DB
  const existing = await collection.findOneAndUpdate(
    { category: actualCategory, used: false },
    { $set: { used: true } },
    { sort: { _id: 1 }, returnDocument: "after" }
  );

  if (existing?.value) {
    const doc = existing.value;
    return {
      question: doc.question,
      answers: doc.answers,
      correct: doc.correct,
    };
  }

  // 🧠 2. Try generating new questions
  for (let attempt = 0; attempt < 20; attempt++) {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 1.2,
      messages: [
        {
          role: "system",
          content: `You are a trivia question generator.`,
        },
        {
          role: "user",
          content: `Generate a trivia question similar to games like Trivia Crack or Trivia Royale. Keep it fun, fast-paced, and easy to read. The topic is "${actualCategory}". Avoid academic tone.

Guidelines:
- Format your response strictly as JSON: {
  "question": "Your trivia question?",
  "answers": ["A", "B", "C", "D"],
  "correct": "A"
}
- Make the answers short (1–5 words)
- Don't repeat structures
- Avoid textbook tone
- Include pop culture, clever twists, surprise choices, etc.`,
        },
      ],
    });

    const raw = completion.choices[0].message.content || "";
    const cleaned = raw
      .replace(/^```json/, "")
      .replace(/```$/, "")
      .replace(/[\x00-\x1F\x7F]/g, "")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      console.error("❌ JSON parse failed:", cleaned);
      continue;
    }

    const questionText = parsed.question?.trim();
    const correctText =
      parsed.answers?.[
        ["A", "B", "C", "D"].indexOf(parsed.correct?.trim().toUpperCase())
      ];

    if (!questionText || !correctText || !parsed.answers?.length) continue;

    // 🔍 Grade creativity
    const creativity = await gradeCreativity(questionText, parsed.answers);
    if (creativity < 5) {
      console.log(`[Rejected] Creativity ${creativity} < 7: "${questionText}"`);
      continue;
    }

    // 💾 Save to MongoDB
    await collection.insertOne({
      category: actualCategory,
      question: questionText,
      answers: parsed.answers,
      correct: correctText,
      used: true,
    });

    // ✅ Shuffle answers and return
    const shuffled = [...parsed.answers].sort(() => Math.random() - 0.5);
    const newCorrectIndex = shuffled.findIndex(
      (ans) => ans.trim().toLowerCase() === correctText.trim().toLowerCase()
    );
    const newCorrectLetter = String.fromCharCode(65 + newCorrectIndex);

    return {
      question: questionText,
      answers: shuffled,
      correct: newCorrectLetter,
    };
  }

  throw new Error("Failed to generate a unique and creative question.");
}
