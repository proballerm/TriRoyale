import "dotenv/config";
import OpenAI from "openai";
import { getTriviaCollection } from "../lib/triviaCollection";
import {
  type DifficultyRank,
  visibleDifficultyForRank,
} from "../lib/triviaDifficulty";
import { evaluateTriviaUniqueness } from "../lib/triviaUniqueness";
import {
  questionFingerprint,
  type CorrectLetter,
  validateTriviaQuestion,
} from "../lib/triviaQuality";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.TRIVIA_RESEARCH_MODEL || process.env.TRIVIA_MODEL || "gpt-4o-mini";
const EMBEDDING_MODEL = process.env.TRIVIA_EMBEDDING_MODEL || "text-embedding-3-small";
const LETTERS: CorrectLetter[] = ["A", "B", "C", "D"];
const SEMANTIC_DUPLICATE_THRESHOLD = 0.88;
const MIN_VERIFICATION_CONFIDENCE = 0.86;
const MIN_OVERALL_QUALITY = 8.2;

const CATEGORY_TOPICS: Record<string, string[]> = {
  Sports: ["strategy and rules", "international competitions", "women's sports", "Olympic history", "sports terminology", "tactics", "equipment and venues"],
  Science: ["astronomy", "human biology", "ecology", "chemistry", "physics", "earth science", "medicine", "scientific discoveries", "computing"],
  Movies: ["international cinema", "directors", "cinematography", "animation", "film music", "classic cinema", "genre history", "production techniques"],
  History: ["ancient civilizations", "medieval history", "African history", "Asian history", "Latin American history", "Middle Eastern history", "social history", "history of technology"],
  Geography: ["physical geography", "borders and regions", "rivers and lakes", "islands", "languages", "national parks", "cultural geography", "geographic superlatives"],
  Music: ["music theory", "instruments", "production", "world music", "classical music", "jazz", "hip-hop history", "songwriting", "live performance"],
  Television: ["international television", "writers and creators", "production", "animation", "game shows", "genre history", "television characters"],
  Literature: ["world literature", "mythology", "poetry", "plays", "literary movements", "authors", "narrative techniques", "book history"],
  Food: ["world cuisines", "ingredients", "cooking techniques", "food science", "regional dishes", "spices", "food history", "baking"],
  Culture: ["festivals", "architecture", "art movements", "writing systems", "folklore", "dance", "craft traditions", "cultural landmarks"],
  Games: ["video game history", "game design", "board games", "chess", "puzzles", "esports history", "card games", "gaming technology"],
};

const RANK_DISTRIBUTION: DifficultyRank[] = [
  2, 3, 4, 4, 5,
  5, 5, 6, 6, 6,
  7, 7, 7, 8, 8,
  8, 9, 9, 10, 10,
];

const RANK_GUIDANCE: Record<DifficultyRank, string> = {
  1: "widely accessible recognition; almost everyone should have a fair chance",
  2: "accessible general knowledge, but not an elementary giveaway",
  3: "moderate recall of a familiar subject",
  4: "solid general knowledge with plausible distractors",
  5: "specific knowledge or a meaningful relationship",
  6: "strong general-trivia knowledge and contextual recall",
  7: "difficult but broadly learnable knowledge",
  8: "advanced context, mechanisms, chronology, or relationships",
  9: "expert-level general trivia without arbitrary obscurity",
  10: "final-round caliber: exceptionally challenging, memorable, and fair",
};

type ResearchFact = {
  category: string;
  topic: string;
  fact: string;
  factKey: string;
  whyInteresting: string;
  sourceTitle: string;
  sourceUrl: string;
  secondarySourceUrl?: string;
};

type GeneratedQuestion = {
  question: string;
  answers: [string, string, string, string];
  correct: CorrectLetter;
  explanation: string;
  difficultyRank: DifficultyRank;
  knowledgeDepth: number;
  obscurity: number;
  interestingness: number;
  distractorQuality: number;
  difficultyAccuracy: number;
  difficultyReason: string;
};

type VerificationResult = {
  verified: boolean;
  confidence: number;
  reason: string;
  canonicalFact: string;
  sourceTitle: string;
  sourceUrl: string;
  secondarySourceUrl?: string;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const valueAfter = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const count = Number(valueAfter("--count") ?? 50);
  const category = valueAfter("--category");
  const rankValue = valueAfter("--rank");
  const rank = rankValue ? Number(rankValue) as DifficultyRank : undefined;
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    throw new Error("--count must be an integer between 1 and 500");
  }
  if (category && !CATEGORY_TOPICS[category]) throw new Error(`Unknown category: ${category}`);
  if (rank !== undefined && (!Number.isInteger(rank) || rank < 1 || rank > 10)) {
    throw new Error("--rank must be an integer between 1 and 10");
  }
  return { count, category, rank };
}

function extractJson<T>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Model response did not contain JSON");
  return JSON.parse(text.slice(start, end + 1)) as T;
}

function choose<T>(values: T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}

function targetRankForIndex(index: number, forcedRank?: DifficultyRank): DifficultyRank {
  return forcedRank ?? RANK_DISTRIBUTION[index % RANK_DISTRIBUTION.length];
}

function overallQuality(question: GeneratedQuestion, verificationConfidence: number): number {
  const uniquenessProxy = 10;
  return (
    question.interestingness * 0.30 +
    question.distractorQuality * 0.25 +
    uniquenessProxy * 0.20 +
    verificationConfidence * 10 * 0.15 +
    question.difficultyAccuracy * 0.10
  );
}

async function researchInterestingFact(category: string, topic: string, rank: DifficultyRank): Promise<ResearchFact> {
  const response = await openai.responses.create({
    model: MODEL,
    tools: [{ type: "web_search", search_context_size: "high" }],
    input: `Research one accurate, time-stable fact for a competitive trivia question.\n\nCategory: ${category}\nTopic: ${topic}\nTarget difficulty rank: ${rank}/10\nDifficulty meaning: ${RANK_GUIDANCE[rank]}\n\nThe fact should be interesting because of an unexpected origin, mechanism, relationship, consequence, design decision, or historical connection. Avoid current statistics, rankings, officeholders, rumors, disputed claims, random serial numbers, and facts that are difficult only because they are trivial or arbitrary.\n\nReturn only JSON:\n{\n  "category": "${category}",\n  "topic": "${topic}",\n  "fact": "one precise sentence",\n  "factKey": "canonical subject-relation-object",\n  "whyInteresting": "one sentence",\n  "sourceTitle": "title",\n  "sourceUrl": "https://...",\n  "secondarySourceUrl": "https://... or empty"\n}`,
  } as any);
  const fact = extractJson<ResearchFact>(response.output_text);
  if (!fact.fact || !fact.factKey || !/^https?:\/\//.test(fact.sourceUrl)) {
    throw new Error("Research result lacked a usable sourced fact");
  }
  return fact;
}

async function turnFactIntoQuestion(fact: ResearchFact, rank: DifficultyRank): Promise<GeneratedQuestion> {
  const response = await openai.responses.create({
    model: MODEL,
    input: `Create one multiple-choice trivia question from this sourced fact.\n\nFACT: ${fact.fact}\nWHY INTERESTING: ${fact.whyInteresting}\nCATEGORY: ${fact.category}\nTOPIC: ${fact.topic}\nTARGET DIFFICULTY: ${rank}/10 (${RANK_GUIDANCE[rank]})\n\nRules:\n- Match the requested rank precisely.\n- The challenge must come from knowledge, context, chronology, mechanisms, or relationships, never confusing wording.\n- Test the interesting part of the fact rather than a shallow keyword.\n- Use four close, plausible peers as choices.\n- Do not reveal the answer through length, grammar, tone, or specificity.\n- Keep the question under 150 characters and each choice under 45 characters.\n- Score knowledgeDepth, obscurity, interestingness, distractorQuality, and difficultyAccuracy from 1 to 10.\n- Reject the idea yourself if obscurity exceeds knowledgeDepth by more than 2.\n\nReturn only JSON:\n{\n  "question": "...?",\n  "answers": ["...", "...", "...", "..."],\n  "correct": "A|B|C|D",\n  "explanation": "concise proof",\n  "difficultyRank": ${rank},\n  "knowledgeDepth": 1,\n  "obscurity": 1,\n  "interestingness": 1,\n  "distractorQuality": 1,\n  "difficultyAccuracy": 1,\n  "difficultyReason": "one sentence"\n}`,
  } as any);
  return extractJson<GeneratedQuestion>(response.output_text);
}

async function verifyQuestion(fact: ResearchFact, question: GeneratedQuestion): Promise<VerificationResult> {
  const correctAnswer = question.answers[LETTERS.indexOf(question.correct)];
  const response = await openai.responses.create({
    model: MODEL,
    tools: [{ type: "web_search", search_context_size: "high" }],
    input: `Independently verify this proposed trivia item using reliable sources.\n\nQuestion: ${question.question}\nProposed answer: ${correctAnswer}\nUnderlying claim: ${fact.fact}\nOriginal source: ${fact.sourceUrl}\n\nReject ambiguity, disputes, outdated claims, or answers not directly supported. Return only JSON:\n{\n  "verified": true,\n  "confidence": 0.0,\n  "reason": "brief result",\n  "canonicalFact": "verified fact",\n  "sourceTitle": "best source title",\n  "sourceUrl": "https://...",\n  "secondarySourceUrl": "https://... or empty"\n}`,
  } as any);
  return extractJson<VerificationResult>(response.output_text);
}

async function createEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    encoding_format: "float",
  });
  return response.data[0]?.embedding ?? [];
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  return leftMagnitude && rightMagnitude
    ? dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude))
    : 0;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");
  const { count, category: forcedCategory, rank: forcedRank } = parseArgs();
  const collection = await getTriviaCollection();
  await collection.createIndex({ fingerprint: 1 }, { unique: true });
  await collection.createIndex({ factKey: 1 }, { unique: true, sparse: true });
  await collection.createIndex({ approvalStatus: 1, difficultyRank: 1, category: 1 });

  const existing = await collection.find({}, {
    projection: { question: 1, fingerprint: 1, factKey: 1, correct: 1, answers: 1, embedding: 1 },
  }).toArray();

  let inserted = 0;
  let attempts = 0;
  const maxAttempts = count * 10;

  while (inserted < count && attempts < maxAttempts) {
    attempts += 1;
    const category = forcedCategory ?? choose(Object.keys(CATEGORY_TOPICS));
    const topic = choose(CATEGORY_TOPICS[category]);
    const rank = targetRankForIndex(inserted, forcedRank);

    try {
      const fact = await researchInterestingFact(category, topic, rank);
      const generated = await turnFactIntoQuestion(fact, rank);
      if (generated.difficultyRank !== rank) throw new Error("Generated rank did not match target");
      if (generated.obscurity > generated.knowledgeDepth + 2) {
        throw new Error("Question is hard because of obscurity rather than knowledge");
      }
      for (const score of [generated.knowledgeDepth, generated.obscurity, generated.interestingness, generated.distractorQuality, generated.difficultyAccuracy]) {
        if (!Number.isFinite(score) || score < 1 || score > 10) throw new Error("Invalid quality score");
      }

      const visibleDifficulty = visibleDifficultyForRank(rank);
      const validation = validateTriviaQuestion({
        question: generated.question,
        answers: generated.answers,
        correct: generated.correct,
        difficulty: visibleDifficulty,
        explanation: generated.explanation,
      }, category);
      if (!validation.valid) throw new Error(validation.reasons.join("; "));

      const correctAnswer = validation.question.answers[LETTERS.indexOf(validation.question.correct)];
      const lexical = evaluateTriviaUniqueness(
        { question: validation.question.question, factKey: fact.factKey, correctAnswer },
        existing.map((doc: any) => ({
          question: doc.question,
          fingerprint: doc.fingerprint,
          factKey: doc.factKey,
          correctAnswer: Array.isArray(doc.answers) ? doc.answers[LETTERS.indexOf(doc.correct)] : undefined,
        })),
        0.72,
      );
      if (!lexical.unique) throw new Error(lexical.reason);

      const embedding = await createEmbedding(`${fact.factKey}\n${validation.question.question}\n${correctAnswer}`);
      const highestSimilarity = existing.reduce((highest: number, doc: any) => {
        return Array.isArray(doc.embedding)
          ? Math.max(highest, cosineSimilarity(embedding, doc.embedding))
          : highest;
      }, 0);
      if (highestSimilarity >= SEMANTIC_DUPLICATE_THRESHOLD) {
        throw new Error(`Semantic duplicate detected (${highestSimilarity.toFixed(3)})`);
      }

      const verification = await verifyQuestion(fact, generated);
      if (!verification.verified || verification.confidence < MIN_VERIFICATION_CONFIDENCE) {
        throw new Error(`Verification failed: ${verification.reason}`);
      }

      const quality = overallQuality(generated, verification.confidence);
      if (quality < MIN_OVERALL_QUALITY) {
        throw new Error(`Overall quality ${quality.toFixed(2)} is below ${MIN_OVERALL_QUALITY}`);
      }

      const now = new Date();
      const document = {
        ...validation.question,
        topic,
        difficultyRank: rank,
        difficultyReason: generated.difficultyReason,
        knowledgeDepth: generated.knowledgeDepth,
        obscurity: generated.obscurity,
        interestingness: generated.interestingness,
        distractorQuality: generated.distractorQuality,
        difficultyAccuracy: generated.difficultyAccuracy,
        overallQuality: quality,
        fingerprint: questionFingerprint(validation.question.question),
        factKey: fact.factKey.trim().toLowerCase(),
        factSummary: verification.canonicalFact || fact.fact,
        whyInteresting: fact.whyInteresting,
        embedding,
        embeddingModel: EMBEDDING_MODEL,
        source: "web-researched",
        sourceTitle: verification.sourceTitle || fact.sourceTitle,
        sourceUrl: verification.sourceUrl || fact.sourceUrl,
        secondarySourceUrl: verification.secondarySourceUrl || fact.secondarySourceUrl || null,
        verifiedAt: now,
        verificationConfidence: verification.confidence,
        verificationReason: verification.reason,
        approvalStatus: "approved",
        createdAt: now,
        lastUsedAt: null,
        usageCount: 0,
        model: MODEL,
      };

      await collection.insertOne(document);
      existing.push(document as any);
      inserted += 1;
      console.log(`[${inserted}/${count}] rank ${rank} ${category}/${topic}: ${validation.question.question}`);
    } catch (error) {
      console.warn(`[attempt ${attempts}] Rejected rank ${rank} ${category}/${topic}:`, error instanceof Error ? error.message : error);
    }
  }

  if (inserted < count) {
    throw new Error(`Only created ${inserted} of ${count} questions after ${attempts} attempts`);
  }
  console.log(`Finished. Added ${inserted} sourced, verified, ranked questions.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
