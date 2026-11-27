import { z } from "zod";

export const candidateImportRowSchema = z.object({
  name: z.string().trim().min(2).max(64),
  email: z.email().max(64).toLowerCase(),
  password: z.string().min(8).max(128),
});

export type CandidateImportRow = z.infer<typeof candidateImportRowSchema>;

export const bankQuestionImportRowSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  type: z.enum([
    "multiple_choice",
    "single_choice",
    "true_false",
    "short_answer",
  ]),
  options: z.string().optional().or(z.literal("")),
  answer: z.string().min(1),
  points: z.coerce.number().int().min(0).max(999),
  difficulty: z.enum(["easy", "medium", "hard"]).optional().default("medium"),
  topicId: z.string().min(1),
});

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
