export const TRIVIA_CATEGORIES = [
  "Sports",
  "Science",
  "Movies",
  "History",
  "Geography",
  "Music",
] as const;

export type TriviaCategory = (typeof TRIVIA_CATEGORIES)[number];
export type CorrectLetter = "A" | "B" | "C" | "D";

export type TriviaQuestion = {
  category: string;
  question: string;
  answers: [string, string, string, string];
  correct: CorrectLetter;
  difficulty: "easy" | "medium" | "hard";
  explanation: string;
};

type ValidationResult =
  | { valid: true; question: TriviaQuestion }
  | { valid: false; reasons: string[] };

const GENERIC_OPENERS = [
  "which of the following",
  "what is the name of",
  "which one of these",
  "what is known as",
];

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizedForComparison(value: string): string {
  return normalize(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function validateTriviaQuestion(
  input: unknown,
  expectedCategory: string,
): ValidationResult {
  const reasons: string[] = [];

  if (!input || typeof input !== "object") {
    return { valid: false, reasons: ["Response is not an object"] };
  }

  const candidate = input as Record<string, unknown>;
  const question = typeof candidate.question === "string" ? normalize(candidate.question) : "";
  const rawAnswers = Array.isArray(candidate.answers) ? candidate.answers : [];
  const answers = rawAnswers.map((answer) =>
    typeof answer === "string" ? normalize(answer) : "",
  );
  const correct =
    typeof candidate.correct === "string"
      ? candidate.correct.trim().toUpperCase()
      : "";
  const difficulty =
    typeof candidate.difficulty === "string"
      ? candidate.difficulty.trim().toLowerCase()
      : "";
  const explanation =
    typeof candidate.explanation === "string"
      ? normalize(candidate.explanation)
      : "";

  if (question.length < 18 || question.length > 150) {
    reasons.push("Question length must be between 18 and 150 characters");
  }

  if (!question.endsWith("?")) {
    reasons.push("Question must end with a question mark");
  }

  if (GENERIC_OPENERS.some((opener) => question.toLowerCase().startsWith(opener))) {
    reasons.push("Question uses an overly generic opener");
  }

  if (answers.length !== 4 || answers.some((answer) => !answer)) {
    reasons.push("Exactly four non-empty answers are required");
  }

  if (answers.some((answer) => answer.length > 45)) {
    reasons.push("Answers must be concise");
  }

  const uniqueAnswers = new Set(answers.map(normalizedForComparison));
  if (uniqueAnswers.size !== 4) {
    reasons.push("Answers must be meaningfully distinct");
  }

  if (!["A", "B", "C", "D"].includes(correct)) {
    reasons.push("Correct answer must be A, B, C, or D");
  }

  if (!["easy", "medium", "hard"].includes(difficulty)) {
    reasons.push("Difficulty must be easy, medium, or hard");
  }

  if (explanation.length < 12 || explanation.length > 180) {
    reasons.push("Explanation must be between 12 and 180 characters");
  }

  if (reasons.length > 0) {
    return { valid: false, reasons };
  }

  return {
    valid: true,
    question: {
      category: expectedCategory,
      question,
      answers: answers as [string, string, string, string],
      correct: correct as CorrectLetter,
      difficulty: difficulty as TriviaQuestion["difficulty"],
      explanation,
    },
  };
}

export function questionFingerprint(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
