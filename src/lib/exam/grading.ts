import {
  joinCanonicalAnswer,
  parseMarkingScheme,
  splitLines,
  type MarkingScheme,
  type MultiSelectRule,
} from "@/lib/exam/markingScheme";

export type GradeableQuestion = {
  type: string;
  answer: string | null;
  points: number;
  markingScheme?: string | null;
  /** Newline-separated option texts; enables the select-all guard. */
  options?: string | null;
};

export type GradeDetail = {
  correctSelected: number;
  wrongSelected: number;
  missed: number;
};

export type GradeResult = {
  /** Null when a person must mark the answer. */
  score: number | null;
  requiresManual: boolean;
  /** Choice questions only. */
  detail: GradeDetail | null;
};

/** Scores are stored with two decimals (partial credit, 0.25 manual steps). */
export const roundScore = (n: number): number => Math.round(n * 100) / 100;

/** Display a score with at most two decimals and no trailing zeros. */
export const formatScore = (n: number | null | undefined) =>
  n == null ? "—" : String(roundScore(n));

/** Whole-number percentage, or null when there is nothing to divide by. */
export const scorePercent = (score: number | null | undefined, max: number) =>
  score == null || max <= 0 ? null : Math.round((score / max) * 100);

const clampScore = (n: number, points: number) =>
  roundScore(Math.min(points, Math.max(0, n)));

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

/**
 * Written responses are marked by a person when the type is `long_answer`,
 * the scheme says `manual`, or a short answer has no keywords to match.
 */
export const isManualQuestion = (question: GradeableQuestion): boolean => {
  if (question.type === "long_answer") return true;
  const scheme = resolveScheme(question);
  if (scheme?.mode === "manual") return true;
  return (
    question.type === "short_answer" &&
    (!scheme || (scheme.keywords ?? []).length === 0)
  );
};

export const resolveMultiSelectRule = (
  scheme: MarkingScheme,
): MultiSelectRule =>
  scheme.multiSelectRule ??
  ((scheme.partialCredit ?? true) ? "partial" : "all_or_nothing");

const gradeChoice = (
  studentText: string,
  scheme: MarkingScheme,
  question: GradeableQuestion,
): { score: number; detail: GradeDetail } => {
  const { points, type } = question;
  const normOpts = {
    caseSensitive: scheme.caseSensitive ?? false,
    normalizeWhitespace: scheme.normalizeWhitespace ?? true,
  };

  const correctSet = new Set(
    (scheme.correctOptions ?? []).map((o) => normalizeText(o, normOpts)),
  );
  const selectedSet = new Set(
    splitLines(studentText).map((o) => normalizeText(o, normOpts)),
  );
  const hits = [...selectedSet].filter((s) => correctSet.has(s)).length;
  const wrongs = selectedSet.size - hits;
  const detail: GradeDetail = {
    correctSelected: hits,
    wrongSelected: wrongs,
    missed: correctSet.size - hits,
  };
  if (correctSet.size === 0 || selectedSet.size === 0)
    return { score: 0, detail };

  if (type === "single_choice" || type === "true_false" || scheme.mode === "exact") {
    // Exactly one pick, and it must be the correct option.
    const score = selectedSet.size === 1 && hits === 1 ? points : 0;
    return { score, detail };
  }

  if (scheme.mode === "any_of") return { score: hits > 0 ? points : 0, detail };

  const perOption = points / correctSet.size;
  const rule = resolveMultiSelectRule(scheme);

  if (rule === "all_or_nothing") {
    const exact = wrongs === 0 && hits === correctSet.size;
    return { score: exact ? points : 0, detail };
  }

  if (rule === "partial_with_penalty") {
    const penalty = scheme.wrongPenalty ?? 1;
    return {
      score: clampScore(perOption * hits - perOption * penalty * wrongs, points),
      detail,
    };
  }

  // partial: wrong picks are ignored, except that ticking every option when
  // some are wrong earns nothing — otherwise "select all" always wins.
  const allOptions = new Set(
    splitLines(question.options).map((o) => normalizeText(o, normOpts)),
  );
  const selectedEveryOption =
    allOptions.size > 0 &&
    [...allOptions].every((o) => selectedSet.has(o)) &&
    allOptions.size > correctSet.size;
  if (selectedEveryOption) return { score: 0, detail };

  const raw =
    scheme.pointsPerMatch != null ?
      scheme.pointsPerMatch * hits
    : perOption * hits;
  return { score: clampScore(raw, points), detail };
};

const gradeShortAnswer = (
  studentText: string,
  scheme: MarkingScheme,
  points: number,
): number => {
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

  const matchCount = keywords.filter((kw) => text.includes(kw)).length;
  if (matchCount === 0) return 0;

  if (scheme.mode === "all_of" && !(scheme.partialCredit ?? true)) {
    return matchCount === keywords.length ? points : 0;
  }

  if (scheme.pointsPerMatch != null) {
    return clampScore(scheme.pointsPerMatch * matchCount, points);
  }
  return clampScore((points * matchCount) / keywords.length, points);
};

/**
 * Grade one response against a snapshotted question. Blank answers score 0 and
 * never need a person; non-blank written answers to manual questions return
 * `score: null` with `requiresManual: true`.
 */
export const gradeAnswer = (
  text: string | null | undefined,
  question: GradeableQuestion,
): GradeResult => {
  const blank = !text?.trim();
  if (isManualQuestion(question)) {
    return blank ?
        { score: 0, requiresManual: false, detail: null }
      : { score: null, requiresManual: true, detail: null };
  }
  if (blank || question.points <= 0)
    return { score: 0, requiresManual: false, detail: null };

  const scheme = resolveScheme(question);
  if (!scheme) return { score: 0, requiresManual: false, detail: null };

  switch (question.type) {
    case "multiple_choice":
    case "single_choice":
    case "true_false": {
      const { score, detail } = gradeChoice(text!, scheme, question);
      return { score: clampScore(score, question.points), requiresManual: false, detail };
    }
    case "short_answer":
      return {
        score: clampScore(gradeShortAnswer(text!, scheme, question.points), question.points),
        requiresManual: false,
        detail: null,
      };
    default:
      return { score: 0, requiresManual: false, detail: null };
  }
};

/** Auto-only score (manual answers count as 0). Kept for existing callers. */
export const autoGrade = (text: string, question: GradeableQuestion): number =>
  gradeAnswer(text, question).score ?? 0;

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
