import { questionFingerprint } from "./triviaQuality";

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "did", "do", "does", "for", "from",
  "had", "has", "have", "how", "in", "is", "it", "its", "of", "on", "or", "that", "the",
  "this", "to", "was", "were", "what", "when", "where", "which", "who", "whose", "why", "with",
]);

export type TriviaUniquenessCandidate = {
  question: string;
  factKey?: string;
  correctAnswer?: string;
};

export type TriviaUniquenessDocument = TriviaUniquenessCandidate & {
  fingerprint?: string;
};

export type TriviaUniquenessResult = {
  unique: boolean;
  reason?: string;
  highestSimilarity: number;
};

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function ngrams(value: string, size: number): Set<string> {
  const source = tokens(value);
  const result = new Set<string>();
  if (source.length < size) return new Set(source);
  for (let index = 0; index <= source.length - size; index += 1) {
    result.add(source.slice(index, index + size).join(" "));
  }
  return result;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 1;
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function normalizedFactKey(value?: string): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function triviaSimilarity(
  left: TriviaUniquenessCandidate,
  right: TriviaUniquenessCandidate,
): number {
  const questionScore = Math.max(
    jaccard(ngrams(left.question, 1), ngrams(right.question, 1)),
    jaccard(ngrams(left.question, 2), ngrams(right.question, 2)),
  );
  const factScore = jaccard(
    ngrams(left.factKey || left.question, 1),
    ngrams(right.factKey || right.question, 1),
  );
  const answerMatch =
    left.correctAnswer && right.correctAnswer &&
    left.correctAnswer.trim().toLowerCase() === right.correctAnswer.trim().toLowerCase()
      ? 0.08
      : 0;
  return Math.min(1, Math.max(questionScore, factScore * 0.94) + answerMatch);
}

export function evaluateTriviaUniqueness(
  candidate: TriviaUniquenessCandidate,
  existing: TriviaUniquenessDocument[],
  threshold = 0.72,
): TriviaUniquenessResult {
  const fingerprint = questionFingerprint(candidate.question);
  const factKey = normalizedFactKey(candidate.factKey);
  let highestSimilarity = 0;

  for (const document of existing) {
    const existingFingerprint = document.fingerprint || questionFingerprint(document.question);
    if (existingFingerprint === fingerprint) {
      return { unique: false, reason: "Exact question fingerprint already exists", highestSimilarity: 1 };
    }

    if (factKey && normalizedFactKey(document.factKey) === factKey) {
      return { unique: false, reason: "The underlying fact already exists", highestSimilarity: 1 };
    }

    const similarity = triviaSimilarity(candidate, document);
    highestSimilarity = Math.max(highestSimilarity, similarity);
    if (similarity >= threshold) {
      return {
        unique: false,
        reason: `Question is too similar to an existing item (${similarity.toFixed(2)})`,
        highestSimilarity,
      };
    }
  }

  return { unique: true, highestSimilarity };
}
