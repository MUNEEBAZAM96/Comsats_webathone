-- Phase 04: difficulty, markingScheme, shuffle flags, AttemptQuestion

ALTER TABLE "exam" ADD COLUMN IF NOT EXISTS "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "exam" ADD COLUMN IF NOT EXISTS "shuffleOptions" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "bank_question" ADD COLUMN IF NOT EXISTS "difficulty" TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE "bank_question" ADD COLUMN IF NOT EXISTS "markingScheme" TEXT;

ALTER TABLE "question" ADD COLUMN IF NOT EXISTS "difficulty" TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE "question" ADD COLUMN IF NOT EXISTS "markingScheme" TEXT;

CREATE TABLE IF NOT EXISTS "attempt_question" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "sourceQuestionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" TEXT,
    "answer" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "markingScheme" TEXT,
    "optionOrder" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attempt_question_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "attempt_question_attemptId_sourceQuestionId_key" ON "attempt_question"("attemptId", "sourceQuestionId");
CREATE INDEX IF NOT EXISTS "attempt_question_attemptId_idx" ON "attempt_question"("attemptId");
CREATE INDEX IF NOT EXISTS "attempt_question_sourceQuestionId_idx" ON "attempt_question"("sourceQuestionId");

ALTER TABLE "answer" ADD COLUMN IF NOT EXISTS "attemptQuestionId" TEXT;

CREATE INDEX IF NOT EXISTS "answer_attemptQuestionId_idx" ON "answer"("attemptQuestionId");
CREATE INDEX IF NOT EXISTS "bank_question_difficulty_idx" ON "bank_question"("difficulty");

-- FKs (ignore if already present)
DO $$ BEGIN
  ALTER TABLE "attempt_question" ADD CONSTRAINT "attempt_question_attemptId_fkey"
    FOREIGN KEY ("attemptId") REFERENCES "exam_attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "attempt_question" ADD CONSTRAINT "attempt_question_sourceQuestionId_fkey"
    FOREIGN KEY ("sourceQuestionId") REFERENCES "question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "answer" ADD CONSTRAINT "answer_attemptQuestionId_fkey"
    FOREIGN KEY ("attemptQuestionId") REFERENCES "attempt_question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill AttemptQuestion from live exam questions for existing attempts
INSERT INTO "attempt_question" (
  "id", "attemptId", "sourceQuestionId", "text", "type", "options", "answer",
  "points", "order", "difficulty", "markingScheme", "optionOrder", "createdAt"
)
SELECT
  gen_random_uuid()::text,
  a."id",
  q."id",
  q."text",
  q."type",
  q."options",
  q."answer",
  q."points",
  q."order",
  COALESCE(q."difficulty", 'medium'),
  q."markingScheme",
  NULL,
  CURRENT_TIMESTAMP
FROM "exam_attempt" a
JOIN "question" q ON q."examId" = a."examId"
WHERE NOT EXISTS (
  SELECT 1 FROM "attempt_question" aq
  WHERE aq."attemptId" = a."id" AND aq."sourceQuestionId" = q."id"
);

-- Dual-write attemptQuestionId onto existing answers
UPDATE "answer" ans
SET "attemptQuestionId" = aq."id"
FROM "attempt_question" aq
WHERE aq."attemptId" = ans."attemptId"
  AND aq."sourceQuestionId" = ans."questionId"
  AND ans."attemptQuestionId" IS NULL;
