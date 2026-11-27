-- AlterTable
ALTER TABLE "exam" ADD COLUMN IF NOT EXISTS "instructions" TEXT;
ALTER TABLE "exam" ADD COLUMN IF NOT EXISTS "totalMarks" INTEGER NOT NULL DEFAULT 0;

-- Backfill totalMarks from existing questions
UPDATE "exam" AS e
SET "totalMarks" = COALESCE((
  SELECT SUM(q."points")::INTEGER FROM "question" q WHERE q."examId" = e."id"
), 0);