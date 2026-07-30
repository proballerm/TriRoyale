import { getTriviaCollection } from "./triviaCollection";
import { questionFingerprint, type CorrectLetter, validateTriviaQuestion } from "./triviaQuality";

export type DifficultyRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type RankedBankQuestion = {
  category: string;
  question: string;
  answers: [string, string, string, string];
  correct: CorrectLetter;
  difficulty: "easy" | "medium" | "hard";
  difficultyRank: DifficultyRank;
  explanation: string;
  fingerprint: string;
  topic?: string;
};

const LETTERS: CorrectLetter[] = ["A", "B", "C", "D"];

export function visibleDifficultyForRank(rank: number): "easy" | "medium" | "hard" {
  if (rank <= 3) return "easy";
  if (rank <= 6) return "medium";
  return "hard";
}

export function tournamentRoundBaseDifficulty(round: number): DifficultyRank {
  const normalizedRound = Math.max(1, Math.min(10, Math.floor(round)));
  const progression: DifficultyRank[] = [2, 3, 4, 5, 6, 7, 8, 8, 9, 10];
  return progression[normalizedRound - 1];
}

export function tournamentQuestionDifficulty(round: number, questionIndex: number): DifficultyRank {
  const base = tournamentRoundBaseDifficulty(round);
  const offset = questionIndex === 0 ? -1 : questionIndex === 2 ? 1 : 0;
  return Math.max(1, Math.min(10, base + offset)) as DifficultyRank;
}

function normalizeStoredQuestion(doc: Record<string, any>): RankedBankQuestion | null {
  const category = typeof doc.category === "string" ? doc.category : "";
  const validation = validateTriviaQuestion(
    {
      question: doc.question,
      answers: doc.answers,
      correct: doc.correct,
      difficulty: doc.difficulty,
      explanation: doc.explanation,
    },
    category,
  );
  if (!validation.valid) return null;
  const rank = Number(doc.difficultyRank);
  if (!Number.isInteger(rank) || rank < 1 || rank > 10) return null;
  const fingerprint = typeof doc.fingerprint === "string"
    ? doc.fingerprint
    : questionFingerprint(validation.question.question);
  return {
    category,
    question: validation.question.question,
    answers: validation.question.answers,
    correct: validation.question.correct,
    difficulty: validation.question.difficulty,
    difficultyRank: rank as DifficultyRank,
    explanation: validation.question.explanation,
    fingerprint,
    topic: typeof doc.topic === "string" ? doc.topic : undefined,
  };
}

export async function getRankedTournamentQuestion(options: {
  targetRank: DifficultyRank;
  excludedFingerprints?: Iterable<string>;
  excludedCategories?: Iterable<string>;
}): Promise<RankedBankQuestion | null> {
  const collection = await getTriviaCollection();
  const excludedFingerprints = [...(options.excludedFingerprints ?? [])];
  const excludedCategories = [...(options.excludedCategories ?? [])];
  const rankOrder = [0, -1, 1, -2, 2]
    .map((offset) => options.targetRank + offset)
    .filter((rank) => rank >= 1 && rank <= 10);

  for (const rank of rankOrder) {
    const query: Record<string, unknown> = {
      approvalStatus: "approved",
      difficultyRank: rank,
    };
    if (excludedFingerprints.length) query.fingerprint = { $nin: excludedFingerprints };
    if (excludedCategories.length) query.category = { $nin: excludedCategories };

    const candidates = await collection
      .aggregate([
        { $match: query },
        { $sample: { size: 12 } },
      ])
      .toArray();

    for (const candidate of candidates) {
      const normalized = normalizeStoredQuestion(candidate as Record<string, any>);
      if (!normalized) continue;
      const claimed = await collection.findOneAndUpdate(
        { _id: candidate._id },
        { $set: { lastUsedAt: new Date() }, $inc: { usageCount: 1 } },
        { returnDocument: "after" },
      );
      if (claimed) return normalized;
    }
  }

  return null;
}

export function correctAnswerText(question: RankedBankQuestion): string {
  return question.answers[LETTERS.indexOf(question.correct)];
}
