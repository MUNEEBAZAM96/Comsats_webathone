import { z } from "zod";
import {
  difficultySchema,
  QUESTION_TYPES,
  splitLines,
} from "@/lib/exam/markingScheme";

const QUESTION_TYPE_SET = new Set<string>(QUESTION_TYPES);

export const paperQuestionSchema = z.object({
  section: z.string().trim().max(120).optional().default(""),
  text: z.string().trim().min(1).max(1000),
  type: z.enum(QUESTION_TYPES),
  options: z.union([z.array(z.string()), z.string()]).optional().default(""),
  answer: z.union([z.array(z.string()), z.string()]).optional().default(""),
  points: z.coerce.number().int().min(1).max(999),
  difficulty: z.preprocess(
    (v) => (v === "" || v == null ? "medium" : v),
    difficultySchema.default("medium"),
  ),
  keywords: z.string().trim().max(2000).optional().default(""),
});

export type PaperQuestionInput = z.infer<typeof paperQuestionSchema>;

export type NormalizedPaperQuestion = {
  section: string;
  text: string;
  type: (typeof QUESTION_TYPES)[number];
  options: string | null;
  answer: string;
  points: number;
  difficulty: "easy" | "medium" | "hard";
  markingScheme: string | null;
};

export type PaperImportIssue = {
  row: number;
  field?: string;
  message: string;
};

export type PaperImportResult = {
  title?: string;
  questions: NormalizedPaperQuestion[];
  issues: PaperImportIssue[];
};

const toLines = (value: string | string[] | undefined | null) => {
  if (value == null) return [];
  if (Array.isArray(value))
    return value.map((v) => String(v).trim()).filter(Boolean);
  return splitLines(String(value).replace(/\|/g, "\n"));
};

const normalizeQuestion = (
  raw: PaperQuestionInput,
  row: number,
  issues: PaperImportIssue[],
): NormalizedPaperQuestion | null => {
  let options = toLines(raw.options);
  const answers = toLines(raw.answer);
  const keywords = raw.keywords
    ? raw.keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
    : [];

  if (
    (raw.type === "multiple_choice" ||
      raw.type === "single_choice" ||
      raw.type === "true_false") &&
    options.length < 2
  ) {
    if (raw.type === "true_false" && options.length === 0) {
      options = ["True", "False"];
    } else {
      issues.push({
        row,
        field: "options",
        message: "Choice questions need at least two options",
      });
      return null;
    }
  }

  if (raw.type === "single_choice" || raw.type === "true_false") {
    if (answers.length !== 1) {
      issues.push({
        row,
        field: "answer",
        message: "Exactly one correct answer is required",
      });
      return null;
    }
    if (!options.includes(answers[0]!)) {
      issues.push({
        row,
        field: "answer",
        message: "Answer must match one of the options",
      });
      return null;
    }
  }

  if (raw.type === "multiple_choice") {
    if (answers.length < 1) {
      issues.push({
        row,
        field: "answer",
        message: "At least one correct option is required",
      });
      return null;
    }
    if (answers.some((a) => !options.includes(a))) {
      issues.push({
        row,
        field: "answer",
        message: "Correct answers must match options",
      });
      return null;
    }
  }

  let markingScheme: string | null = null;
  let answer = answers.join("\n");

  if (raw.type === "short_answer") {
    const keys = keywords.length > 0 ? keywords : answers;
    if (keys.length === 0) {
      issues.push({
        row,
        field: "answer",
        message: "Short answers need keywords (answer or keywords column)",
      });
      return null;
    }
    answer = keys.join(", ");
    markingScheme = JSON.stringify({
      version: 1,
      mode: "keywords_partial",
      keywords: keys,
      partialCredit: true,
    });
  }

  if (raw.type === "long_answer") {
    markingScheme = JSON.stringify({ version: 1, mode: "manual" });
    answer = answers.join("\n") || "Manual grading";
  }

  if (raw.type === "multiple_choice") {
    markingScheme = JSON.stringify({
      version: 1,
      mode: "all_of",
      correctOptions: [...new Set(answers)].sort(),
      partialCredit: true,
    });
    answer = [...new Set(answers)].sort().join("\n");
  }

  return {
    section: raw.section?.trim() || "",
    text: raw.text,
    type: raw.type,
    options:
      options.length > 0 ? options.join("\n")
      : raw.type === "true_false" ? "True\nFalse"
      : null,
    answer,
    points: raw.points,
    difficulty: raw.difficulty ?? "medium",
    markingScheme,
  };
};

export const parsePaperCsvRows = (
  rows: Record<string, unknown>[],
): PaperImportResult => {
  const issues: PaperImportIssue[] = [];
  const questions: NormalizedPaperQuestion[] = [];

  rows.forEach((row, index) => {
    const rowNum = index + 2; // header is row 1
    const normalizedKeys: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      normalizedKeys[key.trim().toLowerCase()] = value;
    }

    const typeRaw = String(normalizedKeys.type ?? "").trim();
    if (typeRaw && !QUESTION_TYPE_SET.has(typeRaw)) {
      issues.push({
        row: rowNum,
        field: "type",
        message: `Unsupported type "${typeRaw}"`,
      });
      return;
    }

    const parsed = paperQuestionSchema.safeParse({
      section: normalizedKeys.section ?? "",
      text: normalizedKeys.text ?? "",
      type: typeRaw || undefined,
      options: normalizedKeys.options ?? "",
      answer: normalizedKeys.answer ?? "",
      points: normalizedKeys.points ?? "",
      difficulty: normalizedKeys.difficulty ?? "medium",
      keywords: normalizedKeys.keywords ?? "",
    });

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({
          row: rowNum,
          field: issue.path.join(".") || undefined,
          message: issue.message,
        });
      }
      return;
    }

    const normalized = normalizeQuestion(parsed.data, rowNum, issues);
    if (normalized) questions.push(normalized);
  });

  return { questions, issues };
};

const jsonPaperSchema = z.object({
  title: z.string().trim().max(200).optional(),
  sections: z
    .array(
      z.object({
        title: z.string().trim().max(120).optional().default(""),
        questions: z.array(z.unknown()).min(1),
      }),
    )
    .min(1),
});

export const parsePaperJson = (payload: unknown): PaperImportResult => {
  const issues: PaperImportIssue[] = [];
  const questions: NormalizedPaperQuestion[] = [];

  const root = jsonPaperSchema.safeParse(payload);
  if (!root.success) {
    return {
      questions: [],
      issues: root.error.issues.map((issue) => ({
        row: 0,
        field: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  let row = 1;
  for (const section of root.data.sections) {
    for (const item of section.questions) {
      const parsed = paperQuestionSchema.safeParse({
        ...(typeof item === "object" && item ? item : {}),
        section:
          section.title ||
          (typeof item === "object" && item && "section" in item ?
            String((item as { section?: string }).section ?? "")
          : ""),
      });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          issues.push({
            row,
            field: issue.path.join(".") || undefined,
            message: issue.message,
          });
        }
        row += 1;
        continue;
      }
      const normalized = normalizeQuestion(parsed.data, row, issues);
      if (normalized) questions.push(normalized);
      row += 1;
    }
  }

  return { title: root.data.title, questions, issues };
};

export const findDuplicateTexts = (
  incoming: { text: string }[],
  existingTexts: string[],
) => {
  const existing = new Set(existingTexts.map((t) => t.trim().toLowerCase()));
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const item of incoming) {
    const key = item.text.trim().toLowerCase();
    if (existing.has(key) || seen.has(key)) duplicates.push(item.text);
    seen.add(key);
  }
  return duplicates;
};
