import assert from "node:assert/strict";
import { addMinutes } from "date-fns";
import {
  computeExamAnalytics,
  median,
  type AnalyticsInput,
} from "../src/features/analytics/services/computeExamAnalytics";

const start = new Date("2026-01-01T09:00:00Z");
const attempt = (
  id: string,
  totalScore: number | null,
  minutes: number,
  submitSource: string | null,
) => ({
  id,
  totalScore,
  maxScore: 10,
  startedAt: start,
  submittedAt: addMinutes(start, minutes),
  submitSource,
});

const input: AnalyticsInput = {
  passMarkPercent: 50,
  assigned: 6,
  started: 5,
  attempts: [
    attempt("A", 10, 30, "manual"),
    attempt("B", 8, 40, "manual"),
    attempt("C", 5, 50, "auto_deadline"),
    attempt("D", 2, 60, null),
    attempt("E", null, 20, "auto_deadline"),
  ],
  questions: [
    {
      id: "q2",
      number: 2,
      text: "Explain closures",
      type: "long_answer",
      points: 8,
      options: null,
      manual: true,
    },
    {
      id: "q1",
      number: 1,
      text: "Pick x",
      type: "single_choice",
      points: 2,
      options: "x\ny\nz",
      manual: false,
    },
  ],
  answers: [
    {
      attemptId: "A",
      questionId: "q1",
      text: "x",
      score: 2,
      manualScore: null,
      points: 2,
    },
    {
      attemptId: "B",
      questionId: "q1",
      text: "x",
      score: 2,
      manualScore: null,
      points: 2,
    },
    {
      attemptId: "C",
      questionId: "q1",
      text: "y",
      score: 0,
      manualScore: null,
      points: 2,
    },
    {
      attemptId: "D",
      questionId: "q1",
      text: "",
      score: 0,
      manualScore: null,
      points: 2,
    },
    {
      attemptId: "E",
      questionId: "q1",
      text: "z",
      score: 0,
      manualScore: null,
      points: 2,
    },
    {
      attemptId: "A",
      questionId: "q2",
      text: "…",
      score: 8,
      manualScore: 8,
      points: 8,
    },
    {
      attemptId: "B",
      questionId: "q2",
      text: "…",
      score: 6,
      manualScore: 6,
      points: 8,
    },
    {
      attemptId: "C",
      questionId: "q2",
      text: "…",
      score: 5,
      manualScore: 5,
      points: 8,
    },
    {
      attemptId: "D",
      questionId: "q2",
      text: "…",
      score: 2,
      manualScore: 2,
      points: 8,
    },
    {
      attemptId: "E",
      questionId: "q2",
      text: "…",
      score: null,
      manualScore: null,
      points: 8,
    },
    // In-progress attempt (not in `attempts`) must be ignored.
    {
      attemptId: "Z",
      questionId: "q1",
      text: "x",
      score: 2,
      manualScore: null,
      points: 2,
    },
  ],
  incidents: [
    { category: "connectivity", severity: "low" },
    { category: "connectivity", severity: "medium" },
    { category: "identity", severity: "medium" },
  ],
};

let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
};

console.log("exam analytics");
const a = computeExamAnalytics(input);

test("median handles odd, even and empty lists", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test("participation counts", () => {
  assert.deepEqual(a.participation, {
    assigned: 6,
    started: 5,
    submitted: 5,
    notStarted: 1,
    completionRate: 83,
    pendingGrading: 1,
  });
  assert.equal(a.empty, false);
});

test("score statistics use graded attempts only", () => {
  assert.equal(a.scores.graded, 4);
  assert.equal(a.scores.maxScore, 10);
  assert.equal(a.scores.mean, 6.25);
  assert.equal(a.scores.median, 6.5);
  assert.equal(a.scores.min, 2);
  assert.equal(a.scores.max, 10);
  assert.equal(a.scores.stdDev, 3.03);
  assert.equal(a.scores.meanPercent, 62.5);
});

test("pass rate uses the pass mark (>=)", () => {
  assert.equal(a.scores.passCount, 3);
  assert.equal(a.scores.passRate, 75);
});

test("histogram uses 10% bins with 100% in the top bin", () => {
  const counts = a.scores.histogram.map((b) => b.count);
  assert.deepEqual(counts, [0, 0, 1, 0, 0, 1, 0, 0, 1, 1]);
  assert.equal(a.scores.histogram[9]!.label, "90–100%");
});

test("questions are ordered by exam number", () => {
  assert.deepEqual(
    a.questions.map((q) => q.id),
    ["q1", "q2"],
  );
});

test("difficulty, discrimination, blanks and option frequency", () => {
  const q1 = a.questions[0]!;
  assert.equal(q1.responses, 5);
  assert.equal(q1.blankPct, 20);
  assert.equal(q1.difficulty, 0.4);
  assert.equal(q1.discrimination, null);
  assert.equal(q1.correctRate, 50);
  assert.equal(q1.skipped, 1);
  assert.equal(q1.averageScore, 0.8);
  assert.deepEqual(q1.optionFrequency, [
    { option: "x", count: 2, pct: 40 },
    { option: "y", count: 1, pct: 20 },
    { option: "z", count: 1, pct: 20 },
  ]);
  assert.equal(q1.averageManualScore, null);
});

test("manual question: p excludes unmarked, average manual score", () => {
  const q2 = a.questions[1]!;
  assert.equal(q2.difficulty, 0.66);
  assert.equal(q2.averageManualScore, 5.25);
  assert.equal(q2.discrimination, null);
  assert.deepEqual(q2.optionFrequency, []);
});

test("time and submit sources", () => {
  assert.equal(a.time.medianMinutes, 40);
  assert.deepEqual(a.time.bySubmitSource, { manual: 3, auto_deadline: 2 });
});

test("incidents are counted by category and severity", () => {
  assert.equal(a.integrity.total, 3);
  assert.deepEqual(a.integrity.byCategory, { connectivity: 2, identity: 1 });
  assert.deepEqual(a.integrity.bySeverity, { low: 1, medium: 2 });
});

test("no pass mark → pass stats are null", () => {
  const b = computeExamAnalytics({ ...input, passMarkPercent: null });
  assert.equal(b.scores.passCount, null);
  assert.equal(b.scores.passRate, null);
});

test("empty exam", () => {
  const e = computeExamAnalytics({
    ...input,
    started: 0,
    attempts: [],
    answers: [],
    incidents: [],
  });
  assert.equal(e.empty, true);
  assert.equal(e.scores.mean, null);
  assert.equal(e.scores.stdDev, null);
  assert.equal(e.questions[0]!.discrimination, null);
  assert.equal(e.participation.completionRate, 0);
});

test("single graded attempt has no discrimination index", () => {
  const s = computeExamAnalytics({ ...input, attempts: [input.attempts[0]!] });
  assert.equal(s.questions[0]!.discrimination, null);
});

test("results with sufficient varied scores produce a discrimination index", () => {
  const attempts = Array.from({ length: 12 }, (_, index) =>
    attempt(String(index), index, 30, "manual"),
  );
  const result = computeExamAnalytics({
    ...input,
    attempts,
    questions: [
      {
        ...input.questions[1]!,
        authoredDifficulty: "easy",
        topicName: "Tables",
        subjectName: "Data",
      },
    ],
    answers: attempts.map(({ id }, index) => ({
      attemptId: id,
      questionId: "q1",
      text: "x",
      score: index >= 6 ? 2 : 0,
      manualScore: null,
      points: 2,
    })),
  });
  assert.equal(result.questions[0]!.discrimination, 1);
  assert.deepEqual(
    result.performance.find(({ dimension }) => dimension === "topic")?.rows,
    [{ label: "Data / Tables", scored: 12, percent: 50 }],
  );
});

console.log(`\n${passed} analytics tests passed`);
