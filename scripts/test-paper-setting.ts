/**
 * Unit checks for paper import + publish readiness (no DB).
 * Run: npx tsx scripts/test-paper-setting.ts
 */
import assert from "node:assert/strict";
import {
  findDuplicateTexts,
  parsePaperCsvRows,
  parsePaperJson,
} from "../src/lib/exam/paperImport";
import { evaluatePublishReadiness } from "../src/lib/exam/publishReadiness";

const csv = parsePaperCsvRows([
  {
    section: "MCQs",
    text: "Capital of France?",
    type: "single_choice",
    options: "Paris|London|Berlin",
    answer: "Paris",
    points: "1",
    difficulty: "easy",
  },
  {
    section: "MCQs",
    text: "Select primes",
    type: "multiple_choice",
    options: "2\n3\n4\n9",
    answer: "2\n3",
    points: "2",
    difficulty: "medium",
  },
  {
    section: "Short",
    text: "Define REST",
    type: "short_answer",
    options: "",
    answer: "",
    keywords: "representational, state, transfer",
    points: "2",
    difficulty: "easy",
  },
]);

assert.equal(csv.issues.length, 0, JSON.stringify(csv.issues));
assert.equal(csv.questions.length, 3);
assert.equal(csv.questions[0]?.options, "Paris\nLondon\nBerlin");
assert.ok(csv.questions[1]?.answer.includes("2"));

const bad = parsePaperCsvRows([
  {
    text: "Broken",
    type: "single_choice",
    options: "OnlyOne",
    answer: "OnlyOne",
    points: "1",
  },
]);
assert.ok(bad.issues.some((i) => i.row === 2));

const json = parsePaperJson({
  title: "Sample",
  sections: [
    {
      title: "Section A",
      questions: [
        {
          text: "2+2?",
          type: "single_choice",
          options: ["3", "4"],
          answer: "4",
          points: 1,
          difficulty: "easy",
        },
      ],
    },
  ],
});
assert.equal(json.issues.length, 0);
assert.equal(json.questions[0]?.section, "Section A");
assert.equal(json.questions[0]?.points, 1);

const dups = findDuplicateTexts(
  [{ text: "Hello" }, { text: "Hello" }],
  ["Other"],
);
assert.equal(dups.length, 1);

const emptyPublish = evaluatePublishReadiness({
  title: "T",
  duration: 60,
  startTime: null,
  endTime: null,
  questions: [],
});
assert.equal(emptyPublish.ready, false);
assert.ok(emptyPublish.issues.some((i) => i.id === "questions"));

const ready = evaluatePublishReadiness({
  title: "Ready exam",
  duration: 30,
  startTime: "2030-01-01T10:00:00.000Z",
  endTime: "2030-01-01T12:00:00.000Z",
  questions: [
    {
      id: "1",
      text: "Q1",
      type: "true_false",
      options: "True\nFalse",
      answer: "True",
      points: 1,
    },
  ],
});
assert.equal(ready.ready, true);

console.log("paper-setting checks passed");
