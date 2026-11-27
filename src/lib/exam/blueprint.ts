import { z } from "zod";

export const examBlueprintSchema = z
  .object({
    totalQuestions: z.number().int().min(1).max(500).optional(),
    totalMarks: z.number().int().min(1).max(10000).optional(),
    difficulty: z
      .object({
        easy: z.number().min(0).max(100).optional(),
        medium: z.number().min(0).max(100).optional(),
        hard: z.number().min(0).max(100).optional(),
      })
      .optional(),
    types: z
      .object({
        single_choice: z.number().min(0).max(100).optional(),
        multiple_choice: z.number().min(0).max(100).optional(),
        true_false: z.number().min(0).max(100).optional(),
        short_answer: z.number().min(0).max(100).optional(),
        long_answer: z.number().min(0).max(100).optional(),
      })
      .optional(),
  })
  .strict();

export type ExamBlueprint = z.infer<typeof examBlueprintSchema>;

export type BlueprintWarning = {
  id: string;
  message: string;
  step: "details" | "questions" | "settings" | "review";
};

const pct = (part: number, total: number) =>
  total <= 0 ? 0 : Math.round((part / total) * 100);

export const parseExamBlueprint = (raw: string | null | undefined) => {
  if (!raw?.trim()) return null;
  try {
    const parsed = examBlueprintSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export const evaluateBlueprint = (
  blueprint: ExamBlueprint | null,
  questions: Array<{ type: string; difficulty?: string | null; points: number }>,
): BlueprintWarning[] => {
  if (!blueprint) return [];
  const warnings: BlueprintWarning[] = [];
  const n = questions.length;
  const marks = questions.reduce((s, q) => s + q.points, 0);

  if (blueprint.totalQuestions != null && n !== blueprint.totalQuestions) {
    warnings.push({
      id: "bp-count",
      message: `Blueprint expects ${blueprint.totalQuestions} questions (currently ${n}).`,
      step: "questions",
    });
  }
  if (blueprint.totalMarks != null && marks !== blueprint.totalMarks) {
    warnings.push({
      id: "bp-marks",
      message: `Blueprint expects ${blueprint.totalMarks} marks (currently ${marks}).`,
      step: "questions",
    });
  }

  if (blueprint.difficulty && n > 0) {
    for (const key of ["easy", "medium", "hard"] as const) {
      const target = blueprint.difficulty[key];
      if (target == null) continue;
      const actual = pct(
        questions.filter((q) => (q.difficulty ?? "medium") === key).length,
        n,
      );
      if (Math.abs(actual - target) > 15) {
        warnings.push({
          id: `bp-diff-${key}`,
          message: `Difficulty ${key}: blueprint ${target}%, paper ${actual}%.`,
          step: "questions",
        });
      }
    }
  }

  if (blueprint.types && n > 0) {
    for (const [type, target] of Object.entries(blueprint.types)) {
      if (target == null) continue;
      const actual = pct(
        questions.filter((q) => q.type === type).length,
        n,
      );
      if (Math.abs(actual - target) > 15) {
        warnings.push({
          id: `bp-type-${type}`,
          message: `Type ${type}: blueprint ${target}%, paper ${actual}%.`,
          step: "questions",
        });
      }
    }
  }

  return warnings;
};

/** Soft readiness percent: 100 minus 8 per blocking issue, minus 3 per blueprint warning. */
export const readinessPercent = (
  issueCount: number,
  warningCount: number,
) => Math.max(0, Math.min(100, 100 - issueCount * 8 - warningCount * 3));
