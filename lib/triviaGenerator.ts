import OpenAI from "openai";
import "dotenv/config";
import { getTriviaCollection } from "./triviaCollection";
import {
  CorrectLetter,
  questionFingerprint,
  TriviaQuestion,
  validateTriviaQuestion,
} from "./triviaQuality";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const LETTERS: CorrectLetter[] = ["A", "B", "C", "D"];
const QUESTION_COOLDOWN_DAYS = 14;
const MAX_GENERATION_ATTEMPTS = 6;

function shuffleForPlay(question: TriviaQuestion) {
  const correctIndex = LETTERS.indexOf(question.correct);
  const correctText = question.answers[correctIndex];
  const shuffled = [...question.answers].sort(() => Math.random() - 0.5);
  const newCorrectIndex = shuffled.findIndex(
    (answer) => answer.trim().toLowerCase() === correctText.trim().toLowerCase(),
  );

  return {
    question: question.question,
    answers: shuffled,
    correct: LETTERS[newCorrectIndex],
    difficulty: question.difficulty,
    explanation: question.explanation,
  };
}

function normalizeStoredQuestion(doc: Record<string, any>, category: string): TriviaQuestion | null {
  if (!Array.isArray(doc.answers) || doc.answers.length !== 4) return null;

  let correct = String(doc.correct || "").trim();
  if (!LETTERS.includes(correct.toUpperCase() as CorrectLetter)) {
    const correctIndex = doc.answers.findIndex(
      (answer: unknown) =>
        typeof answer === "string" &&
        answer.trim().toLowerCase() === correct.toLowerCase(),
    );
    if (correctIndex < 0) return null;
    correct = LETTERS[correctIndex];
  }

  const validation = validateTriviaQuestion(
    {
      question: doc.question,
      answers: doc.answers,
      correct,
      difficulty: doc.difficulty || "medium",
      explanation:
        doc.explanation ||
        `The correct answer is ${doc.answers[LETTERS.indexOf(correct.toUpperCase() as CorrectLetter)]}.`,
    },
    category,
  );

  return validation.valid ? validation.question : null;
}

async function getReusableQuestion(category: string): Promise<TriviaQuestion | null> {
  const collection = await getTriviaCollection();
  const cooldownCutoff = new Date(
    Date.now() - QUESTION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
  );

  const result = await collection.findOneAndUpdate(
    {
      category,
      $or: [
        { lastUsedAt: { $exists: false } },
        { lastUsedAt: { $lt: cooldownCutoff } },
      ],
    },
    {
      $set: { lastUsedAt: new Date() },
      $inc: { usageCount: 1 },
    },
    {
      sort: { usageCount: 1, lastUsedAt: 1, _id: 1 },
      returnDocument: "after",
    },
  );

  const doc = (result as any)?.value ?? result;
  return doc ? normalizeStoredQuestion(doc as Record<string, any>, category) : null;
}

function buildPrompt(category: string, rejectedReasons: string[]): string {
  const retryContext = rejectedReasons.length
    ? `\nPrevious attempt was rejected because: ${rejectedReasons.join("; ")}. Fix those issues.`
    : "";

  return `Create one polished multiple-choice trivia question for a fast multiplayer elimination game.

Category: ${category}
Target player: a general audience, roughly ages 16-40
Difficulty: usually medium; it should reward knowledge without feeling obscure

Quality rules:
- Ask about a specific, verifiable fact with exactly one defensible answer.
- Make the wording lively and natural, but do not use jokes that make the fact unclear.
- Avoid school-exam language such as "Which of the following".
- Avoid trick questions, disputed facts, temporary rankings, exact statistics, and facts likely to change.
- Avoid questions where multiple choices could reasonably be accepted.
- Distractors should be believable and from the same type of thing as the correct answer.
- Do not make the correct answer noticeably longer or more detailed than the distractors.
- Keep the question under 150 characters and each answer under 45 characters.
- Include a one-sentence explanation that confirms why the answer is correct.

Return only valid JSON in this exact shape:
{
  "question": "... ?",
  "answers": ["...", "...", "...", "..."],
  "correct": "A",
  "difficulty": "easy | medium | hard",
  "explanation": "..."
}${retryContext}`;
}

async function generateNewQuestion(category: string): Promise<TriviaQuestion> {
  const collection = await getTriviaCollection();
  let rejectedReasons: string[] = [];

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const completion = await openai.chat.completions.create({
      model: process.env.TRIVIA_MODEL || "gpt-4o-mini",
      temperature: 0.85,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You design fair, concise, high-quality trivia for a real-time multiplayer game. Accuracy and one unambiguous answer matter more than cleverness.",
        },
        {
          role: "user",
          content: buildPrompt(category, rejectedReasons),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      rejectedReasons = ["Response was not valid JSON"];
      continue;
    }

    const validation = validateTriviaQuestion(parsed, category);
    if (!validation.valid) {
      rejectedReasons = validation.reasons;
      continue;
    }

    const question = validation.question;
    const fingerprint = questionFingerprint(question.question);
    const duplicate = await collection.findOne({
      category,
      fingerprint,
    });

    if (duplicate) {
      rejectedReasons = ["Question duplicates an existing question"];
      continue;
    }

    await collection.insertOne({
      ...question,
      fingerprint,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      usageCount: 1,
      source: "ai",
      model: process.env.TRIVIA_MODEL || "gpt-4o-mini",
    });

    return question;
  }

  throw new Error(
    `Failed to generate a valid ${category} trivia question after ${MAX_GENERATION_ATTEMPTS} attempts`,
  );
}

export async function generateTriviaQuestion(category: string) {
  const actualCategory =
    category === "Battle Royale"
      ? ["Sports", "Science", "Movies", "History", "Geography", "Music"][
          Math.floor(Math.random() * 6)
        ]
      : category;

  const reusable = await getReusableQuestion(actualCategory);
  const question = reusable || (await generateNewQuestion(actualCategory));
  return shuffleForPlay(question);
}
