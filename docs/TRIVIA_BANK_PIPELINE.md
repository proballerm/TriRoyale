# Sourced Trivia Bank Pipeline

TriRoyale should build trivia before live matches instead of searching the web while players wait.

## What the builder does

For every candidate it:

1. Chooses a broad category and a less-recently-used subtopic.
2. Uses OpenAI web search to research an interesting, time-stable fact.
3. Converts that fact into a hard multiple-choice question.
4. Runs structural and quality validation.
5. Rejects exact fingerprints, duplicate canonical facts, lexical paraphrases, and embedding-level semantic duplicates.
6. Independently verifies the answer with a second web-search pass.
7. Stores only items with verification confidence of at least `0.86`.
8. Saves source URLs, verification metadata, the canonical fact, an explanation, and the embedding used for future uniqueness checks.

The live game continues to pull questions from MongoDB, so web latency does not affect a duel.

## Initial seed after resetting the collection

```bash
npm install
npm run trivia:seed
```

This requests 100 approved questions across all categories. Building 100 questions can take time and uses web-search, generation, verification, and embedding API calls.

Build a smaller batch first:

```bash
npm run trivia:build-bank -- --count 10
```

Build only one category:

```bash
npm run trivia:build-bank -- --count 25 --category Science
```

Supported categories are Sports, Science, Movies, History, Geography, Music, Television, Literature, Food, Culture, and Games.

## Environment variables

Required:

```env
OPENAI_API_KEY=...
MONGODB_URI=...
```

Optional:

```env
TRIVIA_RESEARCH_MODEL=gpt-4o-mini
TRIVIA_EMBEDDING_MODEL=text-embedding-3-small
```

## Stored approval and provenance fields

New records include:

- `approvalStatus: "approved"`
- `source: "web-researched"`
- `sourceTitle`
- `sourceUrl`
- `secondarySourceUrl`
- `factKey`
- `factSummary`
- `whyInteresting`
- `verifiedAt`
- `verificationConfidence`
- `verificationReason`
- `embedding`
- `embeddingModel`

## Uniqueness thresholds

- Exact fingerprint match: always rejected.
- Exact canonical `factKey` match: always rejected.
- Lexical/fact similarity score of `0.72` or higher: rejected.
- Embedding cosine similarity of `0.88` or higher: rejected.

These values intentionally favor variety over accepting borderline duplicates. They can be tuned after reviewing a few hundred generated candidates.

## Recommended rollout

Start with 10 questions and inspect the MongoDB documents. Then build 100–300 questions in several batches. Large batches are intentionally allowed to reject many candidates; rejection is a quality feature, not a failure.
