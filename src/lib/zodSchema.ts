import { isAfter, parseISO } from "date-fns";
import z from "zod";

export const loginFormSchema = z.object({
  email: z
    .email({ error: "Invalid email address" })
    .max(64, { error: "Email must not exceed 64 characters" })
    .toLowerCase(),
  password: z
    .string()
    .min(8, { error: "Password must be minimum 8 characters long" })
    .max(128, { error: "Password must not exceed 128 characters" }),
  rememberMe: z.boolean(),
});

export type LoginFormType = z.infer<typeof loginFormSchema>;

export const registerFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(5, { error: "Name must be at least 5 characters long" })
      .max(32, { error: "Name must not exceed 32 characters" }),
    email: z
      .email({ error: "Invalid email address" })
      .max(64, { error: "Email must not exceed 64 characters" })
      .toLowerCase(),
    password: z
      .string()
      .min(8, { error: "Password must be minimum 8 characters long" })
      .max(128, { error: "Password must not exceed 128 characters" }),
    confirmPassword: z
      .string()
      .min(1, { error: "Please confirm your password" }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Password didn't match",
    path: ["confirmPassword"],
  });

export type RegisterFormType = z.infer<typeof registerFormSchema>;

export const forgotPasswordSchema = z.object({
  email: z
    .email({ error: "Invalid email address" })
    .max(64, { error: "Email must not exceed 64 characters" })
    .toLowerCase(),
});

export type ForgotPasswordFormType = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, { error: "Password must be minimum 8 characters long" })
      .max(128, { error: "Password must not exceed 128 characters" }),
    confirmPassword: z
      .string()
      .min(1, { error: "Please confirm your password" }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Password didn't match",
    path: ["confirmPassword"],
  });

export type ResetPasswordFormType = z.infer<typeof resetPasswordSchema>;

/** What candidates see once results are published. */
export const RESULT_REVEAL_OPTIONS = [
  "none",
  "score_only",
  "score_and_answers",
] as const;
export type ResultReveal = (typeof RESULT_REVEAL_OPTIONS)[number];

export const QUESTION_TYPE_OPTIONS = [
  "multiple_choice",
  "single_choice",
  "true_false",
  "short_answer",
  "long_answer",
] as const;

const formBoolean = z.preprocess((v) => {
  if (v === true || v === "true" || v === "on" || v === "1") return true;
  if (v === false || v === "false" || v === "off" || v === "0" || v === "")
    return false;
  if (v === undefined || v === null) return false;
  return v;
}, z.boolean());

export const examFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, { error: "Title is required" })
      .max(200, { error: "Title must not exceed 200 characters" }),
    description: z
      .string()
      .trim()
      .max(2000, { error: "Description must not exceed 2000 characters" })
      .optional()
      .or(z.literal("")),
    instructions: z
      .string()
      .trim()
      .max(10000, { error: "Instructions must not exceed 10000 characters" })
      .optional()
      .or(z.literal("")),
    duration: z.coerce
      .number({ error: "Duration must be a number" })
      .int({ error: "Duration must be a whole number" })
      .min(1, { error: "Duration must be at least one minute." })
      .max(1440, { error: "Duration must not exceed 1440 minutes." }),
    startTime: z.string().optional().or(z.literal("")),
    endTime: z.string().optional().or(z.literal("")),
    shuffleQuestions: formBoolean.optional().default(false),
    shuffleOptions: formBoolean.optional().default(false),
    resultReveal: z
      .enum(RESULT_REVEAL_OPTIONS, { error: "Choose what candidates see" })
      .optional()
      .default("score_and_answers"),
    passMarkPercent: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : v),
      z.coerce
        .number({ error: "Pass mark must be a number" })
        .int({ error: "Pass mark must be a whole number" })
        .min(0, { error: "Pass mark must be between 0 and 100." })
        .max(100, { error: "Pass mark must be between 0 and 100." })
        .optional(),
    ),
  })
  .superRefine((data, ctx) => {
    if (!data.startTime || !data.endTime) return;
    const start = parseISO(data.startTime);
    const end = parseISO(data.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
    if (!isAfter(end, start)) {
      ctx.addIssue({
        code: "custom",
        message: "End time must be after start time.",
        path: ["endTime"],
      });
    }
  });

export type ExamFormType = z.infer<typeof examFormSchema>;

export const questionFormSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, { error: "Question text is required" })
      .max(1000, { error: "Question text must not exceed 1000 characters" }),
    type: z.enum(QUESTION_TYPE_OPTIONS, {
      error: "Please select a question type",
    }),
    options: z.string().optional().or(z.literal("")),
    /** Correct option(s), keywords, or grader guidance for manual questions. */
    answer: z
      .string()
      .max(5000, { error: "Answer must not exceed 5000 characters" })
      .optional()
      .default(""),
    points: z.coerce
      .number({ error: "Points must be a number" })
      .int({ error: "Points must be a whole number" })
      .min(0, { error: "Points must be at least 0" })
      .max(999, { error: "Points must not exceed 999" }),
    difficulty: z
      .enum(["easy", "medium", "hard"], {
        error: "Difficulty must be easy, medium, or hard",
      })
      .optional()
      .default("medium"),
    markingScheme: z.string().optional().or(z.literal("")),
    partialCredit: formBoolean.optional(),
    /** Short answers only: mark by hand instead of keyword matching. */
    manualGrading: formBoolean.optional(),
    multiSelectRule: z
      .enum(["all_or_nothing", "partial", "partial_with_penalty"])
      .optional()
      .or(z.literal("")),
    wrongPenalty: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : v),
      z.coerce
        .number({ error: "Penalty must be a number" })
        .min(0, { error: "Penalty must be between 0 and 1" })
        .max(1, { error: "Penalty must be between 0 and 1" })
        .optional(),
    ),
  })
  .refine(
    (data) => {
      if (data.type === "multiple_choice" || data.type === "single_choice") {
        return data.options && data.options.trim().length > 0;
      }
      return true;
    },
    {
      error: "Options are required for this question type",
      path: ["options"],
    },
  )
  .refine(
    (data) => {
      // Manual questions may leave guidance empty; everything auto-graded needs a key.
      if (data.type === "long_answer") return true;
      if (data.type === "short_answer" && data.manualGrading) return true;
      return data.answer.trim().length > 0;
    },
    { error: "Answer is required", path: ["answer"] },
  );

export const randomImportSchema = z.object({
  count: z.coerce
    .number({ error: "Count must be a number" })
    .int()
    .min(1, { error: "Count must be at least 1" })
    .max(100, { error: "Count must not exceed 100" }),
  subjectId: z.string().optional().or(z.literal("")),
  topicId: z.string().optional().or(z.literal("")),
  difficulty: z
    .enum(["easy", "medium", "hard"])
    .optional()
    .or(z.literal("")),
  type: z.enum(QUESTION_TYPE_OPTIONS).optional().or(z.literal("")),
});

export type RandomImportType = z.infer<typeof randomImportSchema>;

export type QuestionFormType = z.infer<typeof questionFormSchema>;

export const bankQuestionFormSchema = questionFormSchema.extend({
  topicId: z.string().min(1, { error: "Topic is required" }),
});

export type BankQuestionFormType = z.infer<typeof bankQuestionFormSchema>;

export const subjectFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Name is required" })
    .max(100, { error: "Name must not exceed 100 characters" }),
  description: z
    .string()
    .trim()
    .max(500, { error: "Description must not exceed 500 characters" })
    .optional()
    .or(z.literal("")),
});

export type SubjectFormType = z.infer<typeof subjectFormSchema>;

export const topicFormSchema = subjectFormSchema;

export type TopicFormType = z.infer<typeof topicFormSchema>;

export const createUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Name must be at least 2 characters long" })
    .max(64, { error: "Name must not exceed 64 characters" }),
  email: z
    .email({ error: "Invalid email address" })
    .max(64, { error: "Email must not exceed 64 characters" })
    .toLowerCase(),
  password: z
    .string()
    .min(8, { error: "Password must be minimum 8 characters long" })
    .max(128, { error: "Password must not exceed 128 characters" }),
  role: z.enum(["admin", "examiner", "proctor", "student"], {
    error: "Please select a role",
  }),
});

export type CreateUserFormType = z.infer<typeof createUserSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, { error: "Current password is required" }),
    newPassword: z
      .string()
      .min(8, { error: "Password must be minimum 8 characters long" })
      .max(128, { error: "Password must not exceed 128 characters" }),
    confirmPassword: z
      .string()
      .min(1, { error: "Please confirm your new password" }),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    error: "Passwords didn't match",
    path: ["confirmPassword"],
  });

export type ChangePasswordFormType = z.infer<typeof changePasswordSchema>;

const recordId = z.string().trim().min(1).max(64);
const optionalRecordId = recordId.optional().or(z.literal(""));

export const INCIDENT_CATEGORIES = [
  "technical",
  "conduct",
  "identity",
  "environment",
  "other",
] as const;
export const INCIDENT_SEVERITIES = ["low", "medium", "high"] as const;
export const INCIDENT_STATUSES = [
  "open",
  "under_review",
  "resolved",
  "dismissed",
] as const;
export const ANNOUNCEMENT_PRIORITIES = ["info", "important", "urgent"] as const;

export const incidentFormSchema = z.object({
  examId: recordId,
  attemptId: optionalRecordId,
  candidateId: optionalRecordId,
  category: z.enum(INCIDENT_CATEGORIES, { error: "Choose a category" }),
  severity: z.enum(INCIDENT_SEVERITIES, { error: "Choose a severity" }),
  description: z
    .string()
    .trim()
    .min(5, { error: "Describe what happened (at least 5 characters)" })
    .max(2000, { error: "Description must not exceed 2000 characters" }),
});

export type IncidentFormType = z.infer<typeof incidentFormSchema>;

export const incidentStatusSchema = z
  .object({
    incidentId: recordId,
    status: z.enum(INCIDENT_STATUSES, { error: "Choose a status" }),
    resolutionNote: z
      .string()
      .trim()
      .max(2000, { error: "Note must not exceed 2000 characters" })
      .optional()
      .or(z.literal("")),
  })
  .refine(
    (d) =>
      (d.status !== "resolved" && d.status !== "dismissed") ||
      (d.resolutionNote ?? "").length >= 3,
    {
      error: "Add a short note explaining the outcome",
      path: ["resolutionNote"],
    },
  );

export type IncidentStatusFormType = z.infer<typeof incidentStatusSchema>;

export const announcementFormSchema = z.object({
  examId: recordId,
  message: z
    .string()
    .trim()
    .min(1, { error: "Message is required" })
    .max(1000, { error: "Message must not exceed 1000 characters" }),
  priority: z
    .enum(ANNOUNCEMENT_PRIORITIES, { error: "Choose a priority" })
    .default("info"),
});

export type AnnouncementFormType = z.input<typeof announcementFormSchema>;

/** Manual marks move in quarter points; the upper bound is the question's points. */
export const SCORE_STEP = 0.25;

const scoreValue = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.coerce
    .number({ error: "Enter a score" })
    .finite({ error: "Score must be a number" })
    .min(0, { error: "Score cannot be negative" })
    .refine((n) => Math.abs(n / SCORE_STEP - Math.round(n / SCORE_STEP)) < 1e-9, {
      error: `Use steps of ${SCORE_STEP} (e.g. 2, 2.25, 2.5)`,
    }),
);

export const manualGradeSchema = z.object({
  answerId: recordId,
  score: scoreValue,
  feedback: z
    .string()
    .trim()
    .max(2000, { error: "Feedback must not exceed 2000 characters" })
    .optional()
    .or(z.literal("")),
});

export type ManualGradeFormType = z.input<typeof manualGradeSchema>;

export const scoreOverrideSchema = z.object({
  answerId: recordId,
  /** null restores the automatic score. */
  score: scoreValue.nullable(),
  reason: z
    .string()
    .trim()
    .min(5, { error: "Give a reason (at least 5 characters)" })
    .max(500, { error: "Reason must not exceed 500 characters" }),
});

export type ScoreOverrideFormType = z.input<typeof scoreOverrideSchema>;

export const resultSettingsSchema = z.object({
  examId: recordId,
  resultReveal: z.enum(RESULT_REVEAL_OPTIONS, { error: "Choose what candidates see" }),
  passMarkPercent: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce
      .number({ error: "Pass mark must be a number" })
      .int({ error: "Pass mark must be a whole number" })
      .min(0, { error: "Pass mark must be at least 0" })
      .max(100, { error: "Pass mark must not exceed 100" })
      .nullable(),
  ),
});

export type ResultSettingsFormType = z.input<typeof resultSettingsSchema>;

export const unpublishResultsSchema = z.object({
  examId: recordId,
  reason: z
    .string()
    .trim()
    .min(5, { error: "Give a reason (at least 5 characters)" })
    .max(500, { error: "Reason must not exceed 500 characters" }),
});
