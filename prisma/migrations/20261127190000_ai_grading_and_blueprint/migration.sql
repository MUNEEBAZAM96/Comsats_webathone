-- AlterTable
ALTER TABLE "exam" ADD COLUMN "blueprintJson" TEXT;

-- AlterTable
ALTER TABLE "answer" ADD COLUMN "gradingStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "answer" ADD COLUMN "gradingSource" TEXT;
ALTER TABLE "answer" ADD COLUMN "aiScore" DOUBLE PRECISION;
ALTER TABLE "answer" ADD COLUMN "aiConfidence" DOUBLE PRECISION;
ALTER TABLE "answer" ADD COLUMN "aiFeedback" TEXT;
ALTER TABLE "answer" ADD COLUMN "aiGradedAt" TIMESTAMP(3);
ALTER TABLE "answer" ADD COLUMN "aiRetryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "answer" ADD COLUMN "aiErrorMessage" TEXT;
ALTER TABLE "answer" ADD COLUMN "aiIdempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "answer_aiIdempotencyKey_key" ON "answer"("aiIdempotencyKey");
CREATE INDEX "answer_gradingStatus_idx" ON "answer"("gradingStatus");
