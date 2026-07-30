import OpenAI from "openai";
import "dotenv/config";
import { getFallbackTriviaQuestion } from "./fallbackTriviaQuestions";
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
const MAX_GENERATION_ATTEMPTS = 10;
const BANK_CANDIDATE_LIMIT = 50;

const CATEGORY_TOPICS: Record<string, string[]> = {
  Sports: [
    "American football strategy and rules",
    "basketball tactics and history",
    "baseball rules and records",
    "soccer tactics and international competition",
    "tennis history and terminology",
    "Olympic sports",
    "combat sports",
    "motorsports",
    "golf",
    "hockey",
    "track and field",
    "sports rules and terminology",
    "international competitions",
    "women's sports",
  ],
  Science: [
    "space and astronomy",
    "human biology",
    "animals and ecology",
    "chemistry",
    "physics",
    "earth science",
    "weather and climate",
    "medicine and anatomy",
    "inventions and discoveries",
    "technology and computing",
    "plants and agriculture",
    "scientific instruments",
  ],
  Movies: [
    "Hollywood films",
    "international cinema",
    "animation",
    "film directors",
    "actors and performances",
    "movie characters",
    "film music",
    "awards history",
    "classic cinema",
    "science-fiction films",
    "comedy films",
    "horror and thriller films",
    "franchises",
    "behind-the-scenes filmmaking",
  ],
  History: [
    "ancient civilizations",
    "medieval history",
    "modern world history",
    "United States history",
    "African history",
    "Asian history",
    "European history",
    "Latin American history",
    "Middle Eastern history",
    "exploration",
    "political movements",
    "wars and diplomacy",
    "social history",
    "history of science and technology",
  ],
  Geography: [
    "countries and capitals",
    "cities and landmarks",
    "rivers and lakes",
    "mountains and deserts",
    "islands and oceans",
    "borders and regions",
    "flags and symbols",
    "languages",
    "population and culture",
    "national parks",
    "physical geography",
    "geographic superlatives that are time-stable",
  ],
  Music: [
    "pop music",
    "rock music",
    "hip-hop and rap",
    "R&B and soul",
    "country music",
    "classical music",
    "jazz and blues",
    "world music",
    "musical instruments",
    "music theory",
    "albums and songs",
    "composers and producers",
    "music history",
    "film and television music",
  ],
  Television: [
    "sitcoms",
    "drama series",
    "animation",
    "reality television",
    "international television",
    "television characters",
    "streaming series",
    "game shows",
    "science-fiction and fantasy television",
  ],
  Literature: [
    "classic novels",
    "modern fiction",
    "children's literature",
    "poetry",
    "mythology",
    "authors",
    "literary characters",
    "plays and theater",
    "world literature",
  ],
  Food: [
    "world cuisines",
    "ingredients",
    "cooking techniques",
    "baking",
    "food history",
    "regional dishes",
    "fruits and vegetables",
    "spices",
    "non-alcoholic beverages",
  ],
  Culture: [
    "festivals and traditions",
    "languages and writing systems",
    "architecture",
    "fashion history",
    "art movements",
    "museums",
    "folklore",
    "dance",
    "religious and cultural landmarks",
  ],
  Games: [
    "video games",
    "board games",
    "card games",
    "chess",
    "game characters",
    "gaming history",
    "puzzles",
    "esports history",
  ],
};

const BATTLE_ROYALE_CATEGORIES = Object.keys(CATEGORY_TOPICS);

export type TriviaGenerationOptions = {
  excludedFingerprints?: Iterable<string>;
  excludedTopics?: Iterable<string>;
  preferredTopic?: string;
  difficultyTarget?: "medium" | "hard";
};

function normalizeSet(values?: Iterable<string>): Set<string> {
  return new Set([...(values ?? [])].map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function shuffle<T>(values: T[]): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function shuffleForPlay(question: TriviaQuestion) {
  const correctIndex = LETTERS.indexOf(question.correct);
  const correctText = question.answers[correctIndex];
  const shuffled = shuffle([...question.answers]);
  const newCorrectIndex = shuffled.findIndex(
    (answer) => answer.trim().toLowerCase() === correctText.trim().toLowerCase(),
  );

  return {
    category: question.category,
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
      difficulty: doc.difficulty || "hard",
      explanation:
        doc.explanation ||
        `The correct answer is ${doc.answers[LETTERS.indexOf(correct.toUpperCase() as CorrectLetter)]}.`,
    },
    category,
  );

  return validation.valid ? validation.question : null;
}

function selectTopic(category: string, options: TriviaGenerationOptions): string {
  if (options.preferredTopic?.trim()) return options.preferredTopic.trim();

  const topics = CATEGORY_TOPICS[category] ?? [category];
  const excludedTopics = normalizeSet(options.excludedTopics);
  const available = topics.filter((topic) => !excludedTopics.has(topic.toLowerCase()));
  const pool = available.length > 0 ? available : topics;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function getReusableQuestion(
  category: string,
  options: TriviaGenerationOptions,
): Promise<TriviaQuestion | null> {
  const collection = await getTriviaCollection();
  const excludedFingerprints = normalizeSet(options.excludedFingerprints);
  const excludedTopics = normalizeSet(options.excludedTopics);
  const requestedDifficulty = options.difficultyTarget ?? "hard";
  const cooldownCutoff = new Date(
    Date.now() - QUESTION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
  );

  const query: Record<string, unknown> = {
    category,
    difficulty: requestedDifficulty,
    $or: [
      { lastUsedAt: { $exists: false } },
      { lastUsedAt: { $lt: cooldownCutoff } },
    ],
  };

  if (excludedFingerprints.size > 0) {
    query.fingerprint = { $nin: [...excludedFingerprints] };
  }

  const candidates = await collection
    .find(query)
    .sort({ usageCount: 1, lastUsedAt: 1, _id: 1 })
    .limit(BANK_CANDIDATE_LIMIT)
    .toArray();

  const validCandidates = candidates
    .map((doc) => ({ doc, question: normalizeStoredQuestion(doc as Record<string, any>, category) }))
    .filter((entry): entry is { doc: Record<string, any>; question: TriviaQuestion } => Boolean(entry.question));

  if (validCandidates.length === 0) return null;

  const topicFresh = validCandidates.filter((entry) => {
    const topic = typeof entry.doc.topic === "string" ? entry.doc.topic.toLowerCase() : "";
    return !topic || !excludedTopics.has(topic);
  });
  const pool = topicFresh.length > 0 ? topicFresh : validCandidates;

  for (const entry of shuffle(pool)) {
    const claimed = await collection.findOneAndUpdate(
      {
        _id: entry.doc._id,
        $or: [
          { lastUsedAt: { $exists: false } },
          { lastUsedAt: { $lt: cooldownCutoff } },
        ],
      },
      {
        $set: { lastUsedAt: new Date() },
        $inc: { usageCount: 1 },
      },
      { returnDocument: "after" },
    );

    const claimedDoc = (claimed as any)?.value ?? claimed;
    if (claimedDoc) return entry.question;
  }

  return null;
}

function buildPrompt(
  category: string,
  topic: string,
  difficultyTarget: "medium" | "hard",
  rejectedReasons: string[],
  excludedFingerprints: Set<string>,
): string {
  const retryContext = rejectedReasons.length
    ? `\nPrevious attempt was rejected because: ${rejectedReasons.join("; ")}. Fix those issues.`
    : "";
  const avoidContext = excludedFingerprints.size
    ? `\nDo not repeat or closely paraphrase these already-used question ideas:\n${[...excludedFingerprints]
        .slice(-30)
        .map((value) => `- ${value}`)
        .join("\n")}`
    : "";

  return `Create one competitive multiple-choice trivia question for a fast multiplayer elimination game.

Broad category: ${category}
Specific topic: ${topic}
Required difficulty: ${difficultyTarget}
Target player: an informed general-audience adult

Difficulty rules:
- This must be genuinely ${difficultyTarget}. Do not produce an elementary fact that most people know instantly.
- Reward specific knowledge, careful recall, or understanding of context rather than pure guessing.
- Avoid beginner-level definitions, obvious capitals, mascot questions, basic release-year questions, and universally famous facts.
- A strong player should need to think, but the answer must not depend on an obscure technicality.
- Do not make the question hard merely through confusing wording.
- All four choices must be plausible to someone who knows the category only moderately well.
- The distractors must be close peers of the correct answer in era, geography, function, genre, or concept.
- The correct answer must not be identifiable by length, specificity, grammar, or tone.

Variety rules:
- Stay within the assigned topic instead of defaulting to its most famous fact.
- Prefer a fresh angle involving mechanisms, terminology, chronology, relationships, creators, causes, consequences, techniques, or lesser-known context.
- Avoid repeatedly asking about capitals, release years, championship winners, and the single most famous person in a field.
- The question must be meaningfully different from common trivia-template questions.

Accuracy and fairness rules:
- Ask about one specific, verifiable, time-stable fact with exactly one defensible answer.
- Avoid disputed facts, temporary rankings, current officeholders, live statistics, and facts likely to change.
- Avoid trick questions, negative phrasing, and "all/none of the above."
- Avoid school-exam wording such as "Which of the following."
- Keep the question under 150 characters and each answer under 45 characters.
- Include a concise explanation that proves why the answer is correct.

Return only valid JSON in this exact shape:
{
  "question": "... ?",
  "answers": ["...", "...", "...", "..."],
  "correct": "A",
  "difficulty": "${difficultyTarget}",
  "explanation": "..."
}${avoidContext}${retryContext}`;
}

async function generateNewQuestion(
  category: string,
  options: TriviaGenerationOptions,
): Promise<TriviaQuestion> {
  const collection = await getTriviaCollection();
  const excludedFingerprints = normalizeSet(options.excludedFingerprints);
  const difficultyTarget = options.difficultyTarget ?? "hard";
  let rejectedReasons: string[] = [];

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const topic = selectTopic(category, options);
    const completion = await openai.chat.completions.create({
      model: process.env.TRIVIA_MODEL || "gpt-4o-mini",
      temperature: 0.78,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You create difficult but fair competitive trivia. Every answer must be factually reliable, every distractor plausible, and every question clearly distinguishable from common trivia-bank material.",
        },
        {
          role: "user",
          content: buildPrompt(category, topic, difficultyTarget, rejectedReasons, excludedFingerprints),
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
    if (question.difficulty !== difficultyTarget) {
      rejectedReasons = [`Difficulty must be exactly ${difficultyTarget}`];
      continue;
    }

    const fingerprint = questionFingerprint(question.question);
    if (excludedFingerprints.has(fingerprint)) {
      rejectedReasons = ["Question repeats an idea already used in this game"];
      continue;
    }

    const duplicate = await collection.findOne({ fingerprint });
    if (duplicate) {
      rejectedReasons = ["Question duplicates an existing question in the bank"];
      excludedFingerprints.add(fingerprint);
      continue;
    }

    try {
      await collection.insertOne({
        ...question,
        topic,
        fingerprint,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        usageCount: 1,
        source: "ai",
        model: process.env.TRIVIA_MODEL || "gpt-4o-mini",
      });
      return question;
    } catch (error: any) {
      if (error?.code === 11000) {
        rejectedReasons = ["Another request created the same question first"];
        excludedFingerprints.add(fingerprint);
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `Failed to generate a valid ${difficultyTarget} ${category} trivia question after ${MAX_GENERATION_ATTEMPTS} attempts`,
  );
}

function chooseBattleRoyaleCategory(excludedTopics: Set<string>): string {
  const categories = shuffle([...BATTLE_ROYALE_CATEGORIES]);
  return categories.find((category) => {
    const topics = CATEGORY_TOPICS[category] ?? [];
    return topics.some((topic) => !excludedTopics.has(topic.toLowerCase()));
  }) ?? categories[0];
}

export async function generateTriviaQuestion(
  category: string,
  options: TriviaGenerationOptions = {},
) {
  const excludedTopics = normalizeSet(options.excludedTopics);
  const actualCategory =
    category === "Battle Royale"
      ? chooseBattleRoyaleCategory(excludedTopics)
      : category;

  try {
    const reusable = await getReusableQuestion(actualCategory, options);
    if (reusable) return shuffleForPlay(reusable);
  } catch (error) {
    console.warn(`[Trivia] Stored question lookup failed for ${actualCategory}; using generation fallback`, error);
  }

  try {
    return shuffleForPlay(await generateNewQuestion(actualCategory, options));
  } catch (error) {
    console.warn(`[Trivia] AI generation failed for ${actualCategory}; using offline fallback`, error);
    return shuffleForPlay(getFallbackTriviaQuestion(actualCategory));
  }
}
