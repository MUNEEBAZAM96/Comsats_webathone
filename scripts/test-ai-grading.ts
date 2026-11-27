/**
 * AI grading schema / blueprint checks (no network).
 * Run: npx tsx scripts/test-ai-grading.ts
 */
import assert from "node:assert/strict";
import {
  evaluateBlueprint,
  parseExamBlueprint,
  readinessPercent,
} from "../src/lib/exam/blueprint";
import { aiGradeResultSchema } from "../src/lib/exam/aiGradeSchema";

const ok = aiGradeResultSchema.safeParse({
  score: 7,
  maxScore: 10,
  percentage: 70,
  confidence: 0.82,
  decision: "needs_review",
  summary: "Covers the main idea.",
  strengths: ["Concept identified"],
  improvements: ["Add an example"],
  criterionFeedback: [
    {
      criterion: "Concept accuracy",
      score: 3,
      maxScore: 4,
      feedback: "Mostly correct",
    },
  ],
  needsReview: true,
});
assert.equal(ok.success, true);

const bad = aiGradeResultSchema.safeParse({
  score: 12,
  maxScore: 10,
  percentage: 120,
  confidence: 2,
  decision: "accept",
  summary: "x",
  strengths: [],
  improvements: [],
  criterionFeedback: [],
  needsReview: false,
  hiddenReasoning: "nope",
});
assert.equal(bad.success, false);

const bp = parseExamBlueprint(
  JSON.stringify({
    difficulty: { easy: 40, medium: 40, hard: 20 },
    types: { single_choice: 60, multiple_choice: 20, long_answer: 20 },
  }),
);
assert.ok(bp);
const warnings = evaluateBlueprint(bp, [
  { type: "single_choice", difficulty: "easy", points: 1 },
  { type: "single_choice", difficulty: "easy", points: 1 },
  { type: "long_answer", difficulty: "hard", points: 5 },
]);
assert.ok(warnings.length > 0);
assert.equal(readinessPercent(0, 0), 100);
assert.ok(readinessPercent(2, 1) < 100);

const rejectExtra = aiGradeResultSchema.safeParse({
  score: 1,
  maxScore: 2,
  percentage: 50,
  confidence: 0.5,
  decision: "accept",
  summary: "ok",
  strengths: [],
  improvements: [],
  criterionFeedback: [],
  needsReview: false,
  internalNotes: "leak",
});
assert.equal(rejectExtra.success, false);

const criterionOver = aiGradeResultSchema.safeParse({
  score: 1,
  maxScore: 2,
  percentage: 50,
  confidence: 0.5,
  decision: "accept",
  summary: "ok",
  strengths: [],
  improvements: [],
  criterionFeedback: [
    { criterion: "Accuracy", score: 5, maxScore: 2, feedback: "too high" },
  ],
  needsReview: false,
});
assert.equal(criterionOver.success, false);

console.log("ai-grading checks passed");
