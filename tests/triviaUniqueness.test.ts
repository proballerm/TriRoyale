import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateTriviaUniqueness,
  triviaSimilarity,
} from "../lib/triviaUniqueness";

test("rejects exact question fingerprints", () => {
  const result = evaluateTriviaUniqueness(
    { question: "Which filmmaker directed the movie Inception?" },
    [{ question: "Which filmmaker directed the movie Inception?" }],
  );
  assert.equal(result.unique, false);
  assert.equal(result.highestSimilarity, 1);
});

test("rejects different wording of the same canonical fact", () => {
  const result = evaluateTriviaUniqueness(
    {
      question: "Who directed Inception?",
      factKey: "christopher nolan directed inception",
      correctAnswer: "Christopher Nolan",
    },
    [{
      question: "Which filmmaker was behind Inception?",
      factKey: "Christopher Nolan directed Inception",
      correctAnswer: "Christopher Nolan",
    }],
  );
  assert.equal(result.unique, false);
  assert.match(result.reason || "", /underlying fact/i);
});

test("allows distinct facts sharing the same broad topic", () => {
  const result = evaluateTriviaUniqueness(
    {
      question: "Which editing technique alternates between events happening at the same time?",
      factKey: "cross cutting alternates simultaneous events",
      correctAnswer: "Cross-cutting",
    },
    [{
      question: "Which director created the film Rashomon?",
      factKey: "akira kurosawa directed rashomon",
      correctAnswer: "Akira Kurosawa",
    }],
  );
  assert.equal(result.unique, true);
});

test("gives paraphrases a higher similarity than unrelated questions", () => {
  const paraphrase = triviaSimilarity(
    { question: "Who directed the film Inception?" },
    { question: "Which filmmaker directed Inception?" },
  );
  const unrelated = triviaSimilarity(
    { question: "Who directed the film Inception?" },
    { question: "Which river passes through Budapest?" },
  );
  assert.ok(paraphrase > unrelated);
});
