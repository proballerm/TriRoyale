import "dotenv/config";
import OpenAI from "openai";
import { getTriviaCollection } from "../lib/triviaCollection";
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
const SEMANTIC_DUPLICATE_THRESHOLD = 0.72;

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

const TRUSTED_SOURCE_HINT = [
  "official organizations and governing bodies",
  "museums, universities, libraries, encyclopedias, and major reference works",
  "reputable science, history, culture, and journalism publications",
  "primary sources when practical",
].join(", ");

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
  difficulty: "hard";
  explanation: string;
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
  const countIndex = args.indexOf("--count");
  const categoryIndex = args.indexOf("--category");
  const count = countIndex >= 0 ? Number(args[countIndex + 1]) : 50;
  const category = categoryIndex >= 0 ? args[categoryIndex + 1] : undefined;
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    throw new Error("--count must be an integer between 1 and 500");
  }
  if (category && !CATEGORY_TOPICS[category]) {
    throw new Error(`Unknown category: ${category}`);
  }
  return { count, category };
}

function extractJson<T>(text: string): T {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Model response did not contain JSON");
  return JSON.parse(trimmed.slice(start, end + 1)) as T;
}

function chooseCategory(requested?: string): string {
  if (requested) return requested;
  const categories = Object.keys(CATEGORY_TOPICS);
  return categories[Math.floor(Math.random() * categories.length)];
}

function chooseTopic(category: string, recentlyUsed: Set<string>): string {
  const topics = CATEGORY_TOPICS[category];
  const fresh = topics.filter((topic) => !recentlyUsed.has(`${category}:${topic}`.toLowerCase()));
  const pool = fresh.length ? fresh : topics;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function researchInterestingFact(category: string, topic: string): Promise<ResearchFact> {
  const response = await openai.responses.create({
    model: MODEL,
    tools: [{ type: "web_search", search_context_size: "high" }],
    input: `Research one unusual, interesting, time-stable fact suitable for a difficult competitive trivia question.\n\nCategory: ${category}\nTopic: ${topic}\n\nUse ${TRUSTED_SOURCE_HINT}. Avoid current statistics, rankings, officeholders, rumors, disputed claims, simple firsts unless the context is surprising, and facts that are famous enough to be obvious. Prefer a fact with a memorable relationship, mechanism, origin, consequence, design choice, or historical connection.\n\nReturn only JSON with this shape:\n{\n  "category": "${category}",\n  "topic": "${topic}",\n  "fact": "one precise sentence",\n  "factKey": "short canonical subject-relation-object representation",\n  "whyInteresting": "one sentence",\n  "sourceTitle": "title",\n  "sourceUrl": "https://...",\n  "secondarySourceUrl": "https://... or empty"\n}`,
  } as any);
  const fact = extractJson<ResearchFact>(response.output_text);
  if (!fact.fact || !fact.factKey || !/^https?:\/\//.test(fact.sourceUrl)) {
    throw new Error("Research result was missing a usable fact or source");
  }
  return fact;
}

async function turnFactIntoQuestion(fact: ResearchFact): Promise<GeneratedQuestion> {
  const response = await openai.responses.create({
    model: MODEL,
    input: `Turn the verified source fact below into one genuinely hard but fair multiple-choice trivia question.\n\nFACT: ${fact.fact}\nWHY IT IS INTERESTING: ${fact.whyInteresting}\nCATEGORY: ${fact.category}\nTOPIC: ${fact.topic}\n\nRules:\n- Test the interesting relationship or context, not a shallow keyword from the sentence.\n- The answer must be provable from the supplied fact.\n- Use four close, plausible peers as choices.\n- Do not reveal the answer through length, grammar, specificity, chronology, or tone.\n- Avoid negative phrasing, trick wording, exact-current statistics, and school-test phrasing.\n- Keep the question under 150 characters and each answer under 45 characters.\n- Difficulty must be hard for an informed adult, not obscure through technical jargon.\n\nReturn only JSON:\n{\n  "question": "...?",\n  "answers": ["...", "...", "...", "..."],\n  "correct": "A|B|C|D",\n  "difficulty": "hard",\n  "explanation": "concise proof using the sourced fact"\n}`,
  } as any);
  return extractJson<GeneratedQuestion>(response.output_text);
}

async function verifyQuestion(
  fact: ResearchFact,
  question: GeneratedQuestion,
): Promise<VerificationResult> {
  const correctIndex = LETTERS.indexOf(question.correct);
  const correctAnswer = question.answers[correctIndex];
  const response = await openai.responses.create({
    model: MODEL,
    tools: [{ type: "web_search", search_context_size: "high" }],
    input: `Independently verify this proposed trivia item using reliable web sources.\n\nQuestion: ${question.question}\nProposed correct answer: ${correctAnswer}\nUnderlying claim: ${fact.fact}\nOriginal source: ${fact.sourceUrl}\n\nReject it if the answer is ambiguous, disputed, outdated, dependent on wording, or not directly supported. Confidence is from 0 to 1. Return only JSON:\n{\n  "verified": true,\n  "confidence": 0.0,\n  "reason": "brief verification result",\n  "canonicalFact": "precise verified fact",\n  "sourceTitle": "best source title",\n  "sourceUrl": "https://...",\n  "secondarySourceUrl": "https://... or empty"\n}`,
  } as any);
  return extractJson<VerificationResult>(response.output_text);
}

async function createEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    encoding_format: "float",
  });
  return response.data[0]?.embedding || [];
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
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");
  const { count, category: requestedCategory } = parseArgs();
  const collection = await getTriviaCollection();
  await collection.createIndex({ fingerprint: 1 }, { unique: true });
  await collection.createIndex({ factKey: 1 }, { unique: true, sparse: true });
  await collection.createIndex({ approvalStatus: 1, category: 1, topic: 1 });

  const existing = await collection
    .find({}, { projection: { question: 1, fingerprint: 1, factKey: 1, correct: 1, answers: 1, embedding: 1 } })
    .toArray();
  const recentlyUsedTopics = new Set<string>();
  let inserted = 0;
  let attempts = 0;
  const maxAttempts = count * 8;

  while (inserted < count && attempts < maxAttempts) {
    attempts += 1;
    const category = chooseCategory(requestedCategory);
    const topic = chooseTopic(category, recentlyUsedTopics);
    try {
      const fact = await researchInterestingFact(category, topic);
      const question = await turnFactIntoQuestion(fact);
      const validation = validateTriviaQuestion(question, category);
      if (!validation.valid) throw new Error(validation.reasons.join("; "));
      if (validation.question.difficulty !== "hard") throw new Error("Question was not rated hard");

      const correctIndex = LETTERS.indexOf(validation.question.correct);
      const correctAnswer = validation.question.answers[correctIndex];
      const lexicalCheck = evaluateTriviaUniqueness(
        { question: validation.question.question, factKey: fact.factKey, correctAnswer },
        existing.map((doc: any) => ({
          question: doc.question,
          fingerprint: doc.fingerprint,
          factKey: doc.factKey,
          correctAnswer: Array.isArray(doc.answers) ? doc.answers[LETTERS.indexOf(doc.correct)] : undefined,
        })),
        SEMANTIC_DUPLICATE_THRESHOLD,
      );
      if (!lexicalCheck.unique) throw new Error(lexicalCheck.reason);

      const embeddingText = `${fact.factKey}\n${validation.question.question}\n${correctAnswer}`;
      const embedding = await createEmbedding(embeddingText);
      let highestEmbeddingSimilarity = 0;
      for (const doc of existing as any[]) {
        if (!Array.isArray(doc.embedding)) continue;
        highestEmbeddingSimilarity = Math.max(
          highestEmbeddingSimilarity,
          cosineSimilarity(embedding, doc.embedding),
        );
      }
      if (highestEmbeddingSimilarity >= 0.88) {
        throw new Error(`Semantic duplicate detected (${highestEmbeddingSimilarity.toFixed(3)})`);
      }

      const verification = await verifyQuestion(fact, question);
      if (!verification.verified || verification.confidence < 0.86) {
        throw new Error(`Verification failed: ${verification.reason}`);
      }

      const now = new Date();
      const document = {
        ...validation.question,
        topic,
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
      recentlyUsedTopics.add(`${category}:${topic}`.toLowerCase());
      inserted += 1;
      console.log(`[${inserted}/${count}] Added ${category} / ${topic}: ${validation.question.question}`);
    } catch (error) {
      console.warn(`[attempt ${attempts}] Rejected ${category} / ${topic}:`, error instanceof Error ? error.message : error);
    }
  }

  if (inserted < count) {
    throw new Error(`Only created ${inserted} of ${count} requested questions after ${attempts} attempts`);
  }
  console.log(`Finished. Added ${inserted} verified, sourced, unique questions.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
