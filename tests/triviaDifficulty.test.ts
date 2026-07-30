import assert from "node:assert/strict";
import test from "node:test";
import {
  tournamentQuestionDifficulty,
  tournamentRoundBaseDifficulty,
  visibleDifficultyForRank,
} from "../lib/triviaDifficulty";

test("tournament round difficulty rises from accessible to final-round", () => {
  assert.equal(tournamentRoundBaseDifficulty(1), 2);
  assert.equal(tournamentRoundBaseDifficulty(5), 6);
  assert.equal(tournamentRoundBaseDifficulty(9), 9);
  assert.equal(tournamentRoundBaseDifficulty(10), 10);
});

test("questions within a duel rise around the round target", () => {
  assert.deepEqual(
    [0, 1, 2].map((index) => tournamentQuestionDifficulty(5, index)),
    [5, 6, 7],
  );
  assert.deepEqual(
    [0, 1, 2].map((index) => tournamentQuestionDifficulty(10, index)),
    [9, 10, 10],
  );
});

test("difficulty ranks map to visible labels", () => {
  assert.equal(visibleDifficultyForRank(2), "easy");
  assert.equal(visibleDifficultyForRank(5), "medium");
  assert.equal(visibleDifficultyForRank(9), "hard");
});
