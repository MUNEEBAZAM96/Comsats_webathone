import { createEnv } from "@t3-oss/env-nextjs";
import z from "zod";

export const serverEnv = createEnv({
  server: {
    DATABASE_URL: z
      .string()
      .min(1, { error: "DATABASE_URL is required" })
      .refine(
        (value) =>
          value.startsWith("postgresql://") || value.startsWith("postgres://"),
        {
          error:
            "DATABASE_URL must be a Postgres connection string (postgresql:// or postgres://)",
        },
      ),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_ALLOWED_ORIGINS: z.string().optional(),
    BETTER_AUTH_TELEMETRY: z.enum(["0", "1"]).optional(),
    CHECKPOINT_DISABLE: z.enum(["1", "0"]).optional(),
    BETTER_AUTH_SEED_ADMIN_EMAIL: z.email().optional(),
    CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
    CLOUDINARY_API_KEY: z.string().min(1).optional(),
    CLOUDINARY_API_SECRET: z.string().min(1).optional(),
    CLOUDINARY_FOLDER_MODE: z.string().min(1).optional(),
    /** Server-only Groq key for AI-assisted written grading. Never NEXT_PUBLIC_. */
    GROQ_API_KEY: z.string().min(1).optional(),
    GROQ_MODEL: z.string().min(1).optional(),
    AI_GRADING_ENABLED: z.enum(["true", "false"]).optional(),
    AI_GRADING_MAX_RETRIES: z.coerce.number().int().min(0).max(5).optional(),
    AI_GRADING_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(60000)
      .optional(),
    AI_GRADING_REVIEW_THRESHOLD: z.coerce.number().min(0).max(1).optional(),
  },
  emptyStringAsUndefined: true,
  experimental__runtimeEnv: process.env,
});
