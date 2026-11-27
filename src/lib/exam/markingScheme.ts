import { z } from "zod";

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const difficultySchema = z.enum(DIFFICULTIES, {
  error: "Difficulty must be easy, medium, or hard",
});

export const markingSchemeSchema = z.object({
  version: z.literal(1),
  mode: z.enum([
    "exact",
    "all_of",
    "any_of",
    "keywords_partial",
    "manual",
  ]),
  correctOptions: z.array(z.string().min(1)).optional(),
  keywords: z.array(z.string().min(1)).optional(),
  caseSensitive: z.boolean().optional(),
  normalizeWhitespace: z.boolean().optional(),
  partialCredit: z.boolean().optional(),
  pointsPerMatch: z.number().nullable().optional(),
  /** Multi-select only. Missing → derived from `partialCredit` (legacy). */
  multiSelectRule: z
    .enum(["all_or_nothing", "partial", "partial_with_penalty"])
    .optional(),
  /** Fraction of one correct option's credit deducted per wrong pick. */
  wrongPenalty: z.number().min(0).max(1).optional(),
});

export const MULTI_SELECT_RULES = [
  "all_or_nothing",
  "partial",
  "partial_with_penalty",
] as const;
export type MultiSelectRule = (typeof MULTI_SELECT_RULES)[number];

/** Question types that are always graded by a person. */
export const MANUAL_ONLY_TYPES = ["long_answer"] as const;

export const QUESTION_TYPES = [
  "multiple_choice",
  "single_choice",
  "true_false",
  "short_answer",
  "long_answer",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export type MarkingScheme = z.infer<typeof markingSchemeSchema>;

/** Split newline-separated options / multi answers. */
export const splitLines = (value: string | null | undefined): string[] =>
  (value ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

/** Canonical multi-select answer storage: sorted unique lines joined by \\n. */
export const joinCanonicalAnswer = (options: string[]): string =>
  [...new Set(options.map((o) => o.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .join("\n");

export const parseMarkingScheme = (
  raw: string | null | undefined,
): MarkingScheme | null => {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = markingSchemeSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

export const serializeMarkingScheme = (scheme: MarkingScheme): string =>
  JSON.stringify(scheme);

/**
 * Build a marking scheme + legacy `answer` string from form fields.
 * `answer` from the form is treated as:
 * - choice: newline-separated correct option texts (or single line)
 * - short_answer: comma-separated keywords (legacy) unless markingSchemeJson provided
 */
export const buildQuestionGradingFields = (input: {
  type: string;
  answer: string;
  markingSchemeJson?: string | null;
  partialCredit?: boolean;
  /** short_answer only: skip keyword marking and grade by hand */
  manualGrading?: boolean;
  multiSelectRule?: MultiSelectRule;
  wrongPenalty?: number;
}): { answer: string; markingScheme: string | null } => {
  if (
    input.type === "long_answer" ||
    (input.type === "short_answer" && input.manualGrading)
  ) {
    // `answer` holds optional model-answer / rubric guidance for graders.
    const scheme: MarkingScheme = { version: 1, mode: "manual" };
    return {
      answer: input.answer.trim(),
      markingScheme: serializeMarkingScheme(scheme),
    };
  }

  if (input.markingSchemeJson?.trim()) {
    const parsed = parseMarkingScheme(input.markingSchemeJson);
    if (!parsed) throw new Error("Invalid marking scheme JSON");
    const answer =
      parsed.correctOptions && parsed.correctOptions.length > 0 ?
        (
          input.type === "multiple_choice" ?
            joinCanonicalAnswer(parsed.correctOptions)
          : parsed.correctOptions[0]!
        )
      : parsed.keywords && parsed.keywords.length > 0 ?
        parsed.keywords.join(", ")
      : input.answer;
    return { answer, markingScheme: serializeMarkingScheme(parsed) };
  }

  if (input.type === "short_answer") {
    const keywords = input.answer
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    const scheme: MarkingScheme = {
      version: 1,
      mode: "keywords_partial",
      keywords,
      caseSensitive: false,
      normalizeWhitespace: true,
      partialCredit: input.partialCredit ?? true,
    };
    return {
      answer: keywords.join(", "),
      markingScheme: serializeMarkingScheme(scheme),
    };
  }

  if (
    input.type === "multiple_choice" ||
    input.type === "single_choice" ||
    input.type === "true_false"
  ) {
    const correctOptions = splitLines(input.answer);
    if (correctOptions.length === 0)
      throw new Error("At least one correct option is required");
    if (
      (input.type === "single_choice" || input.type === "true_false") &&
      correctOptions.length !== 1
    )
      throw new Error("Single-answer questions require exactly one correct option");

    const isMulti = input.type === "multiple_choice";
    const multiSelectRule: MultiSelectRule | undefined =
      isMulti ?
        (input.multiSelectRule ??
        ((input.partialCredit ?? true) ? "partial" : "all_or_nothing"))
      : undefined;
    const scheme: MarkingScheme = {
      version: 1,
      mode: isMulti ? "all_of" : "exact",
      correctOptions,
      caseSensitive: false,
      normalizeWhitespace: true,
      partialCredit: isMulti ? multiSelectRule !== "all_or_nothing" : false,
      ...(multiSelectRule ? { multiSelectRule } : {}),
      ...(multiSelectRule === "partial_with_penalty" ?
        { wrongPenalty: input.wrongPenalty ?? 1 }
      : {}),
    };

    return {
      answer:
        input.type === "multiple_choice" ?
          joinCanonicalAnswer(correctOptions)
        : correctOptions[0]!,
      markingScheme: serializeMarkingScheme(scheme),
    };
  }

  return { answer: input.answer, markingScheme: null };
};

/** Fisher–Yates shuffle (crypto-quality enough via Math.random for exam UX). */
export const shuffleArray = <T>(items: T[]): T[] => {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
};
