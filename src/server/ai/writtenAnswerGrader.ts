import "server-only";

import Groq from "groq-sdk";
import {
  aiGradeResultSchema,
  type AiGradeResult,
} from "@/lib/exam/aiGradeSchema";
import { serverEnv } from "@/lib/env/serverEnv";

export { aiGradeResultSchema, type AiGradeResult };

export type WrittenGradeInput = {
  examTitle: string;
  subject?: string | null;
  topic?: string | null;
  questionText: string;
  questionInstructions?: string | null;
  maxScore: number;
  expectedAnswer?: string | null;
  markingScheme?: string | null;
  studentAnswer: string;
};

export type WrittenGradeOutcome =
  | { ok: true; result: AiGradeResult }
  | { ok: false; error: string; unavailable?: boolean };

const aiConfig = () => {
  const enabled = (serverEnv.AI_GRADING_ENABLED ?? "true") === "true";
  const apiKey = serverEnv.GROQ_API_KEY;
  return {
    enabled,
    apiKey,
    model: serverEnv.GROQ_MODEL ?? "llama-3.3-70b-versatile",
    maxRetries: serverEnv.AI_GRADING_MAX_RETRIES ?? 2,
    timeoutMs: serverEnv.AI_GRADING_TIMEOUT_MS ?? 20_000,
    reviewThreshold: serverEnv.AI_GRADING_REVIEW_THRESHOLD ?? 0.7,
  };
};

export const isAiGradingConfigured = () => {
  const cfg = aiConfig();
  return cfg.enabled && Boolean(cfg.apiKey);
};

const SYSTEM_PROMPT = `You are an exam grading assistant. Grade only against the supplied question and rubric.
Do not invent facts. Do not reward irrelevant verbosity. Do not penalize grammar unless language quality is part of the rubric.
Do not grade protected or personal characteristics. Do not exceed maximum marks. Do not assign negative marks.
Return concise evidence-based feedback. Return ONLY the requested JSON object with no markdown.`;

const buildUserPrompt = (input: WrittenGradeInput) =>
  JSON.stringify({
    examTitle: input.examTitle,
    subject: input.subject ?? undefined,
    topic: input.topic ?? undefined,
    questionText: input.questionText,
    instructions: input.questionInstructions ?? undefined,
    maxScore: input.maxScore,
    expectedAnswer: input.expectedAnswer?.trim() || undefined,
    markingScheme: input.markingScheme ?? undefined,
    studentAnswer: input.studentAnswer,
    outputSchema: {
      score: "number 0..maxScore",
      maxScore: "must equal the provided maxScore",
      percentage: "0..100",
      confidence: "0..1",
      decision: "accept | needs_review | reject",
      summary: "string",
      strengths: "string[]",
      improvements: "string[]",
      criterionFeedback: [
        { criterion: "string", score: "number", maxScore: "number", feedback: "string" },
      ],
      needsReview: "boolean",
    },
  });

const parseModelJson = (raw: string, maxScore: number) => {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  const parsed = JSON.parse(cleaned) as unknown;
  const result = aiGradeResultSchema.safeParse({
    ...(typeof parsed === "object" && parsed ? parsed : {}),
    maxScore,
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid AI grade JSON");
  }
  if (Math.abs(result.data.maxScore - maxScore) > 0.001) {
    throw new Error("AI maxScore mismatch");
  }
  const expectedPct = Math.round((result.data.score / maxScore) * 100);
  if (Math.abs(result.data.percentage - expectedPct) > 2) {
    return {
      ...result.data,
      percentage: expectedPct,
    };
  }
  return result.data;
};

export const gradeWrittenAnswerWithGroq = async (
  input: WrittenGradeInput,
): Promise<WrittenGradeOutcome> => {
  const cfg = aiConfig();
  if (!cfg.enabled) {
    return { ok: false, error: "AI grading is disabled", unavailable: true };
  }
  if (!cfg.apiKey) {
    return { ok: false, error: "GROQ_API_KEY is not configured", unavailable: true };
  }

  const client = new Groq({ apiKey: cfg.apiKey });
  let lastError = "AI grading failed";

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      const completion = await client.chat.completions.create(
        {
          model: cfg.model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(input) },
          ],
        },
        { signal: controller.signal },
      );
      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error("Empty model response");
      let result = parseModelJson(content, input.maxScore);
      if (
        result.confidence < cfg.reviewThreshold ||
        result.decision === "needs_review"
      ) {
        result = { ...result, needsReview: true, decision: "needs_review" };
      }
      return { ok: true, result };
    } catch (error) {
      lastError =
        error instanceof Error ? error.message.slice(0, 300) : "AI grading failed";
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, error: lastError };
};
