import { z } from "zod";
import {
  difficultySchema,
  parseMarkingScheme,
  QUESTION_TYPES,
  splitLines,
} from "@/lib/exam/markingScheme";

export const candidateImportRowSchema = z.object({
  name: z.string().trim().min(2).max(64),
  email: z.string().trim().toLowerCase().pipe(z.email().max(64)),
  password: z.string().min(8).max(128),
  role: z.union([z.literal("student"), z.literal("")]).optional(),
});

export const bankQuestionImportRowSchema = z
  .object({
    text: z.string().trim().min(1).max(1000),
    type: z.enum(QUESTION_TYPES),
    options: z.string().trim().max(12000).optional().default(""),
    answer: z.string().trim().max(12000).optional().default(""),
    points: z
      .union([z.number(), z.string().trim().min(1)])
      .pipe(z.coerce.number<string | number>().int().min(0).max(999)),
    difficulty: z.preprocess(
      (value) => (value === "" ? undefined : value),
      difficultySchema.default("medium"),
    ),
    topicid: z.string().trim().max(64).optional(),
    topicId: z.string().trim().max(64).optional(),
    markingscheme: z.string().trim().max(12000).optional(),
    markingScheme: z.string().trim().max(12000).optional(),
  })
  .transform((row) => ({
    ...row,
    topicId: row.topicid ?? row.topicId ?? "",
    markingScheme: row.markingscheme ?? row.markingScheme ?? "",
  }))
  .superRefine((row, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (!row.topicId) issue("topicId", "A topic identifier is required");
    const scheme = parseMarkingScheme(row.markingScheme);
    if (row.markingScheme && !scheme)
      issue("markingScheme", "Invalid marking scheme JSON");
    const options = splitLines(row.options);
    const correct = splitLines(row.answer);
    if (row.type === "short_answer" || row.type === "long_answer") {
      if (options.length)
        issue("options", "Written questions do not use options");
      if (
        scheme?.correctOptions?.length ||
        (scheme && !["manual", "keywords_partial"].includes(scheme.mode))
      ) {
        issue(
          "markingScheme",
          "Use manual or keyword grading for written questions",
        );
      }
      if (row.type === "long_answer" && scheme && scheme.mode !== "manual")
        issue("markingScheme", "Long answers require manual grading");
      if (
        row.type === "short_answer" &&
        scheme?.mode !== "manual" &&
        !(scheme?.keywords ?? row.answer.split(",")).some((keyword) =>
          keyword.trim(),
        )
      )
        issue(
          "answer",
          "Enter comma-separated keywords or choose manual grading",
        );
      return;
    }
    const choices =
      row.type === "true_false" && options.length === 0
        ? ["True", "False"]
        : options;
    if (
      choices.length < 2 ||
      choices.length > 24 ||
      new Set(choices).size !== choices.length ||
      (row.type === "true_false" && choices.length !== 2)
    ) {
      issue("options", "Enter distinct options on separate lines");
    }
    const count =
      row.type === "multiple_choice"
        ? correct.length >= 1
        : correct.length === 1;
    if (
      !count ||
      new Set(correct).size !== correct.length ||
      correct.some((answer) => !choices.includes(answer))
    ) {
      issue("answer", "Enter the correct option text, one per line");
    }
    if (
      scheme &&
      (scheme.mode !== (row.type === "multiple_choice" ? "all_of" : "exact") ||
        !scheme.correctOptions ||
        scheme.correctOptions.length !== correct.length ||
        correct.some((answer) => !scheme.correctOptions?.includes(answer)) ||
        scheme.keywords?.length ||
        (row.type !== "multiple_choice" && scheme.multiSelectRule))
    ) {
      issue("markingScheme", "Choice grading must match the correct options");
    }
  });

export type CandidateImportRow = z.infer<typeof candidateImportRowSchema>;
export type BankQuestionImportRow = z.infer<typeof bankQuestionImportRowSchema>;

export const CANDIDATE_CSV_HEADERS = ["name", "email", "password"] as const;
export const BANK_QUESTION_CSV_HEADERS = [
  "text",
  "type",
  "options",
  "answer",
  "points",
  "difficulty",
  "topicId",
] as const;
