import { z } from "zod";

const criterionSchema = z.object({
  criterion: z.string().trim().min(1).max(200),
  score: z.number().min(0),
  maxScore: z.number().min(0),
  feedback: z.string().trim().max(500),
});

export const aiGradeResultSchema = z
  .object({
    score: z.number().min(0),
    maxScore: z.number().positive(),
    percentage: z.number().min(0).max(100),
    confidence: z.number().min(0).max(1),
    decision: z.enum(["accept", "needs_review", "reject"]),
    summary: z.string().trim().min(1).max(1000),
    strengths: z.array(z.string().trim().max(300)).max(8),
    improvements: z.array(z.string().trim().max(300)).max(8),
    criterionFeedback: z.array(criterionSchema).max(12),
    needsReview: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.score > value.maxScore) {
      ctx.addIssue({
        code: "custom",
        path: ["score"],
        message: "score cannot exceed maxScore",
      });
    }
    for (const [i, row] of value.criterionFeedback.entries()) {
      if (row.score > row.maxScore) {
        ctx.addIssue({
          code: "custom",
          path: ["criterionFeedback", i, "score"],
          message: "criterion score exceeds max",
        });
      }
    }
  });

export type AiGradeResult = z.infer<typeof aiGradeResultSchema>;
