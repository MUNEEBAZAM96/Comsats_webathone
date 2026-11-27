/**
 * Lightweight grading assertions (no Jest). Run: npx tsx scripts/grade-smoke.ts
 */
import { autoGrade } from "../src/lib/exam/grading";
import {
  buildQuestionGradingFields,
  serializeMarkingScheme,
} from "../src/lib/exam/markingScheme";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

// Multi-select set equality (order-independent)
{
  const { answer, markingScheme } = buildQuestionGradingFields({
    type: "multiple_choice",
    answer: "B\nA",
    partialCredit: false,
  });
  assert(answer === "A\nB", `canonical answer expected A\\nB got ${answer}`);
  const q = { type: "multiple_choice", answer, points: 4, markingScheme };
  assert(autoGrade("B\nA", q) === 4, "full set match");
  assert(autoGrade("A", q) === 0, "partial blocked when partialCredit false");
  assert(autoGrade("A\nB\nC", q) === 0, "extras fail when partialCredit false");
}

// Multi-select partial
{
  const { answer, markingScheme } = buildQuestionGradingFields({
    type: "multiple_choice",
    answer: "A\nB",
    partialCredit: true,
  });
  const q = { type: "multiple_choice", answer, points: 4, markingScheme };
  assert(autoGrade("A", q) === 2, "half credit");
  assert(autoGrade("A\nC", q) === 2, "extras ignored under partial");
}

// Keywords partial
{
  const scheme = serializeMarkingScheme({
    version: 1,
    mode: "keywords_partial",
    keywords: ["http", "tcp"],
    partialCredit: true,
  });
  const q = {
    type: "short_answer",
    answer: "http, tcp",
    points: 10,
    markingScheme: scheme,
  };
  assert(autoGrade("uses HTTP over TCP", q) === 10, "both keywords");
  assert(autoGrade("only HTTP here", q) === 5, "one keyword");
}

// Single choice
{
  const { answer, markingScheme } = buildQuestionGradingFields({
    type: "single_choice",
    answer: "Paris",
  });
  const q = { type: "single_choice", answer, points: 1, markingScheme };
  assert(autoGrade("Paris", q) === 1, "single correct");
  assert(autoGrade("London", q) === 0, "single wrong");
}

console.log("grade-smoke: all assertions passed");
