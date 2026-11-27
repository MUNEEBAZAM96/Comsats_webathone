import assert from "node:assert/strict";
import {
  autoGrade,
  gradeAnswer,
  isManualQuestion,
  roundScore,
  type GradeableQuestion,
} from "../src/lib/exam/grading";
import {
  buildQuestionGradingFields,
  serializeMarkingScheme,
  type MarkingScheme,
} from "../src/lib/exam/markingScheme";

const scheme = (s: Omit<MarkingScheme, "version">) =>
  serializeMarkingScheme({ version: 1, ...s });

const multi = (
  overrides: Partial<Omit<MarkingScheme, "version">> = {},
  points = 3,
): GradeableQuestion => ({
  type: "multiple_choice",
  answer: "A\nB\nC",
  points,
  options: "A\nB\nC\nD\nE",
  markingScheme: scheme({
    mode: "all_of",
    correctOptions: ["A", "B", "C"],
    ...overrides,
  }),
});

const single: GradeableQuestion = {
  type: "single_choice",
  answer: "const",
  points: 2,
  options: "var\nlet\nconst",
  markingScheme: scheme({ mode: "exact", correctOptions: ["const"] }),
};

const shortKw = (
  overrides: Partial<Omit<MarkingScheme, "version">> = {},
): GradeableQuestion => ({
  type: "short_answer",
  answer: "queue, fifo",
  points: 4,
  markingScheme: scheme({
    mode: "keywords_partial",
    keywords: ["queue", "fifo"],
    ...overrides,
  }),
});

const score = (text: string, q: GradeableQuestion) => gradeAnswer(text, q).score;

const cases: [string, () => void][] = [
  ["roundScore keeps two decimals", () => {
    assert.equal(roundScore(1 / 3), 0.33);
    assert.equal(roundScore(2.675), 2.68);
  }],
  ["single choice correct", () => assert.equal(score("const", single), 2)],
  ["single choice wrong", () => assert.equal(score("var", single), 0)],
  ["single choice two picks scores 0", () => assert.equal(score("const\nvar", single), 0)],
  ["single choice ignores case/whitespace", () => assert.equal(score("  CONST ", single), 2)],
  ["true/false correct", () =>
    assert.equal(
      score("True", {
        type: "true_false",
        answer: "True",
        points: 1,
        markingScheme: scheme({ mode: "exact", correctOptions: ["True"] }),
      }),
      1,
    )],
  ["legacy partial (no rule) = partial, proportional", () =>
    assert.equal(score("A\nB", multi({ partialCredit: true })), 2)],
  ["legacy partialCredit=false = all_or_nothing", () => {
    assert.equal(score("A\nB", multi({ partialCredit: false })), 0);
    assert.equal(score("A\nB\nC", multi({ partialCredit: false })), 3);
  }],
  ["all_or_nothing exact set", () =>
    assert.equal(score("C\nA\nB", multi({ multiSelectRule: "all_or_nothing" })), 3)],
  ["all_or_nothing with extra scores 0", () =>
    assert.equal(score("A\nB\nC\nD", multi({ multiSelectRule: "all_or_nothing" })), 0)],
  ["partial ignores one wrong pick", () =>
    assert.equal(score("A\nB\nD", multi({ multiSelectRule: "partial" })), 2)],
  ["partial select-all guard scores 0", () =>
    assert.equal(score("A\nB\nC\nD\nE", multi({ multiSelectRule: "partial" })), 0)],
  ["partial select-all is fine when every option is correct", () =>
    assert.equal(
      score("A\nB", {
        type: "multiple_choice",
        answer: "A\nB",
        points: 2,
        options: "A\nB",
        markingScheme: scheme({ mode: "all_of", correctOptions: ["A", "B"], multiSelectRule: "partial" }),
      }),
      2,
    )],
  ["partial fractional credit rounds to 2dp", () =>
    assert.equal(score("A", multi({ multiSelectRule: "partial" }, 2)), 0.67)],
  ["partial_with_penalty default penalty 1", () =>
    assert.equal(score("A\nB\nD", multi({ multiSelectRule: "partial_with_penalty" })), 1)],
  ["partial_with_penalty half penalty", () =>
    assert.equal(
      score("A\nB\nD", multi({ multiSelectRule: "partial_with_penalty", wrongPenalty: 0.5 })),
      1.5,
    )],
  ["partial_with_penalty floors at 0", () =>
    assert.equal(score("A\nD\nE", multi({ multiSelectRule: "partial_with_penalty" })), 0)],
  ["partial_with_penalty all correct = full", () =>
    assert.equal(score("A\nB\nC", multi({ multiSelectRule: "partial_with_penalty" })), 3)],
  ["choice detail counts hits / wrongs / missed", () =>
    assert.deepEqual(gradeAnswer("A\nD", multi()).detail, {
      correctSelected: 1,
      wrongSelected: 1,
      missed: 2,
    })],
  ["any_of gives full points for one hit", () =>
    assert.equal(score("B", multi({ mode: "any_of" })), 3)],
  ["pointsPerMatch is capped at points", () =>
    assert.equal(score("A\nB\nC", multi({ multiSelectRule: "partial", pointsPerMatch: 2 })), 3)],
  ["short keywords partial", () => assert.equal(score("It is a queue", shortKw()), 2)],
  ["short keywords all hit", () => assert.equal(score("FIFO queue", shortKw()), 4)],
  ["short keywords all_of strict", () =>
    assert.equal(score("queue", shortKw({ mode: "all_of", partialCredit: false })), 0)],
  ["short exact single keyword", () =>
    assert.equal(score(" Queue ", shortKw({ mode: "exact", keywords: ["queue"] })), 4)],
  ["short case-sensitive", () =>
    assert.equal(score("QUEUE", shortKw({ caseSensitive: true })), 0)],
  ["legacy short answer without scheme uses comma keywords", () =>
    assert.equal(score("queue", { type: "short_answer", answer: "queue, fifo", points: 2 }), 1)],
  ["manual short answer needs a person", () => {
    const q: GradeableQuestion = {
      type: "short_answer",
      answer: "",
      points: 5,
      markingScheme: scheme({ mode: "manual" }),
    };
    assert.deepEqual(gradeAnswer("my essay", q), { score: null, requiresManual: true, detail: null });
    assert.equal(autoGrade("my essay", q), 0);
  }],
  ["long_answer is always manual", () => {
    const q: GradeableQuestion = { type: "long_answer", answer: null, points: 10 };
    assert.equal(isManualQuestion(q), true);
    assert.equal(gradeAnswer("text", q).requiresManual, true);
  }],
  ["blank manual answer scores 0 without a person", () =>
    assert.deepEqual(
      gradeAnswer("   ", { type: "long_answer", answer: null, points: 10 }),
      { score: 0, requiresManual: false, detail: null },
    )],
  ["short answer without keywords is manual", () =>
    assert.equal(isManualQuestion({ type: "short_answer", answer: "", points: 2 }), true)],
  ["blank choice scores 0", () => assert.equal(score("", single), 0)],
  ["zero-point question scores 0", () => assert.equal(score("const", { ...single, points: 0 }), 0)],
  ["buildQuestionGradingFields: long_answer → manual scheme", () => {
    const f = buildQuestionGradingFields({ type: "long_answer", answer: " rubric " });
    assert.equal(f.answer, "rubric");
    assert.equal(JSON.parse(f.markingScheme!).mode, "manual");
  }],
  ["buildQuestionGradingFields: penalty rule stored", () => {
    const f = buildQuestionGradingFields({
      type: "multiple_choice",
      answer: "B\nA",
      multiSelectRule: "partial_with_penalty",
      wrongPenalty: 0.5,
    });
    const parsed = JSON.parse(f.markingScheme!);
    assert.equal(f.answer, "A\nB");
    assert.equal(parsed.multiSelectRule, "partial_with_penalty");
    assert.equal(parsed.wrongPenalty, 0.5);
  }],
  ["buildQuestionGradingFields: manual short answer", () => {
    const f = buildQuestionGradingFields({ type: "short_answer", answer: "", manualGrading: true });
    assert.equal(JSON.parse(f.markingScheme!).mode, "manual");
  }],
];

let passed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL ${name}: ${e instanceof Error ? e.message : e}`);
  }
}
console.log(`${passed}/${cases.length} passed`);
if (passed !== cases.length) process.exit(1);
