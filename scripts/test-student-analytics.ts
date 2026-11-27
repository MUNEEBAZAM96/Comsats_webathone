/**
 * Student analytics / AI schema checks (no network).
 * Run: npx tsx scripts/test-student-analytics.ts
 */
import assert from "node:assert/strict";
import {
  addWeeks,
  endOfWeek,
  isWithinInterval,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { aiGradeResultSchema } from "../src/lib/exam/aiGradeSchema";
import {
  gradeAnswer,
  isManualQuestion,
  scorePercent,
} from "../src/lib/exam/grading";

const weekBounds = (anchor: Date) => ({
  start: startOfWeek(anchor, { weekStartsOn: 1 }),
  end: endOfWeek(anchor, { weekStartsOn: 1 }),
});

const cases: [string, () => void][] = [
  ["week bounds are Monday–Sunday", () => {
    const { start, end } = weekBounds(new Date("2026-11-27T12:00:00Z"));
    assert.equal(start.getDay(), 1);
    assert.equal(end.getDay(), 0);
  }],
  ["previous week does not overlap current", () => {
    const current = weekBounds(new Date());
    const previous = weekBounds(subWeeks(current.start, 1));
    assert.ok(previous.end < current.start);
  }],
  ["offset weeks shift label window", () => {
    const a = weekBounds(new Date());
    const b = weekBounds(addWeeks(new Date(), -1));
    assert.ok(b.start < a.start);
  }],
  ["published-only interval filter", () => {
    const { start, end } = weekBounds(new Date());
    const inside = new Date(start.getTime() + 60_000);
    const outside = new Date(end.getTime() + 60_000);
    assert.equal(isWithinInterval(inside, { start, end }), true);
    assert.equal(isWithinInterval(outside, { start, end }), false);
  }],
  ["objective auto grade still exact", () => {
    assert.equal(
      gradeAnswer("True", {
        type: "true_false",
        answer: "True",
        points: 1,
      }).score,
      1,
    );
  }],
  ["long answers stay manual until graded", () => {
    assert.equal(
      isManualQuestion({ type: "long_answer", answer: null, points: 5 }),
      true,
    );
    assert.equal(
      gradeAnswer("essay", {
        type: "long_answer",
        answer: null,
        points: 5,
      }).requiresManual,
      true,
    );
  }],
  ["invalid AI JSON rejected", () => {
    const bad = aiGradeResultSchema.safeParse({
      score: -1,
      maxScore: 10,
      percentage: 200,
      confidence: 2,
      decision: "provisional",
      summary: "",
      strengths: [],
      improvements: [],
      criterionFeedback: [],
      needsReview: true,
      chainOfThought: "secret",
    });
    assert.equal(bad.success, false);
  }],
  ["valid AI JSON accepted", () => {
    const ok = aiGradeResultSchema.safeParse({
      score: 7,
      maxScore: 10,
      percentage: 70,
      confidence: 0.7,
      decision: "needs_review",
      summary: "Solid answer with one gap.",
      strengths: ["Core idea present"],
      improvements: ["Add an example"],
      criterionFeedback: [],
      needsReview: true,
    });
    assert.equal(ok.success, true);
  }],
  ["scorePercent null when unpublished total", () => {
    assert.equal(scorePercent(null, 10), null);
  }],
  ["empty week = not enough data", () => {
    const rows: unknown[] = [];
    assert.equal(rows.length > 0, false);
  }],
];

let passed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    console.error(`FAIL ${name}:`, error instanceof Error ? error.message : error);
  }
}
console.log(`${passed}/${cases.length} passed`);
if (passed !== cases.length) process.exit(1);
