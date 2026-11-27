import {
  joinCanonicalAnswer,
  parseMarkingScheme,
  splitLines,
  type MarkingScheme,
} from "@/lib/exam/markingScheme";

export type GradeableQuestion = {
  type: string;
  answer: string | null;
  points: number;
  markingScheme?: string | null;
};

export const normalizeText = (
  s: string,
  opts: { caseSensitive?: boolean; normalizeWhitespace?: boolean } = {},
): string => {
  const caseSensitive = opts.caseSensitive ?? false;
  const normalizeWhitespace = opts.normalizeWhitespace ?? true;
  let out = s.trim();
  if (normalizeWhitespace) out = out.replace(/\s+/g, " ");
  if (!caseSensitive) out = out.toLowerCase();
  return out;
};

const resolveScheme = (question: GradeableQuestion): MarkingScheme | null => {
  const parsed = parseMarkingScheme(question.markingScheme);
  if (parsed) return parsed;

  // Legacy fallbacks
  if (!question.answer) return null;

  if (question.type === "short_answer") {
    return {
      version: 1,
      mode: "keywords_partial",
      keywords: question.answer
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      caseSensitive: false,
      normalizeWhitespace: true,
      partialCredit: true,
    };
  }

  if (
    question.type === "multiple_choice" ||
    question.type === "single_choice" ||
    question.type === "true_false"
  ) {
    const correctOptions = splitLines(question.answer);
    return {
      version: 1,
      mode: question.type === "multiple_choice" ? "all_of" : "exact",
      correctOptions,
      caseSensitive: false,
      normalizeWhitespace: true,
      partialCredit: question.type === "multiple_choice",
    };
  }

  return null;
};

const gradeChoice = (
  studentText: string,
  scheme: MarkingScheme,
  points: number,
  type: string,
): number => {
  const normOpts = {
    caseSensitive: scheme.caseSensitive ?? false,
    normalizeWhitespace: scheme.normalizeWhitespace ?? true,
  };

  const correct = (scheme.correctOptions ?? []).map((o) =>
    normalizeText(o, normOpts),
  );
  if (correct.length === 0) return 0;

  const selected = splitLines(studentText).map((o) =>
    normalizeText(o, normOpts),
  );
  if (selected.length === 0) return 0;

  const correctSet = new Set(correct);
  const selectedSet = new Set(selected);

  if (type === "single_choice" || type === "true_false" || scheme.mode === "exact") {
    if (selectedSet.size !== 1) return 0;
    const only = [...selectedSet][0]!;
    // Exact: student pick must equal the single correct option (or be in correct set of size 1)
    if (correctSet.size === 1) return correctSet.has(only) ? points : 0;
    return correct[0] === only ? points : 0;
  }

  // multiple_choice / all_of
  if (scheme.mode === "any_of") {
    const hit = [...selectedSet].some((s) => correctSet.has(s));
    return hit ? points : 0;
  }

  const intersection = [...selectedSet].filter((s) => correctSet.has(s));
  const extras = [...selectedSet].filter((s) => !correctSet.has(s));
  const partialCredit = scheme.partialCredit ?? true;

  if (!partialCredit) {
    // Full credit only when sets equal
    if (extras.length > 0) return 0;
    if (intersection.length !== correctSet.size) return 0;
    return points;
  }

  // Partial: proportional on |intersection| / |correct|; extras ignored
  if (intersection.length === 0) return 0;
  if (scheme.pointsPerMatch != null) {
    return Math.min(
      points,
      Math.round(scheme.pointsPerMatch * intersection.length),
    );
  }
  return Math.round((points * intersection.length) / correctSet.size);
};

const gradeShortAnswer = (
  studentText: string,
  scheme: MarkingScheme,
  points: number,
): number => {
  if (scheme.mode === "manual") return 0;

  const normOpts = {
    caseSensitive: scheme.caseSensitive ?? false,
    normalizeWhitespace: scheme.normalizeWhitespace ?? true,
  };
  const text = normalizeText(studentText, normOpts);
  if (!text) return 0;

  if (scheme.mode === "exact") {
    const target = normalizeText(
      (scheme.keywords ?? []).join(" ") || "",
      normOpts,
    );
    // Prefer single keyword as exact phrase; else compare to joined keywords
    const exactTargets =
      scheme.keywords && scheme.keywords.length === 1 ?
        [normalizeText(scheme.keywords[0]!, normOpts)]
      : [target];
    return exactTargets.some((t) => t && text === t) ? points : 0;
  }

  const keywords = (scheme.keywords ?? []).map((k) =>
    normalizeText(k, normOpts),
  );
  if (keywords.length === 0) return 0;

  if (scheme.mode === "any_of") {
    return keywords.some((kw) => text.includes(kw)) ? points : 0;
  }

  // keywords_partial / all_of (partial proportional)
  const matchCount = keywords.filter((kw) => text.includes(kw)).length;
  if (matchCount === 0) return 0;

  if (scheme.mode === "all_of" && !(scheme.partialCredit ?? true)) {
    return matchCount === keywords.length ? points : 0;
  }

  if (scheme.pointsPerMatch != null) {
    return Math.min(points, Math.round(scheme.pointsPerMatch * matchCount));
  }
  return Math.round((points * matchCount) / keywords.length);
};

/** Auto-grade a student response against a snapshotted question. */
export const autoGrade = (
  text: string,
  question: GradeableQuestion,
): number => {
  if (!text?.trim()) return 0;
  if (question.points <= 0) return 0;

  const scheme = resolveScheme(question);
  if (!scheme) return 0;
  if (scheme.mode === "manual") return 0;

  switch (question.type) {
    case "multiple_choice":
    case "single_choice":
    case "true_false":
      return gradeChoice(text, scheme, question.points, question.type);
    case "short_answer":
      return gradeShortAnswer(text, scheme, question.points);
    default:
      return 0;
  }
};

/** Ensure legacy answer string stays in sync with scheme correctOptions. */
export const syncAnswerFromScheme = (
  type: string,
  scheme: MarkingScheme | null,
  fallbackAnswer: string,
): string => {
  if (!scheme) return fallbackAnswer;
  if (scheme.correctOptions && scheme.correctOptions.length > 0) {
    return type === "multiple_choice" ?
        joinCanonicalAnswer(scheme.correctOptions)
      : scheme.correctOptions[0]!;
  }
  if (scheme.keywords && scheme.keywords.length > 0) {
    return scheme.keywords.join(", ");
  }
  return fallbackAnswer;
};
