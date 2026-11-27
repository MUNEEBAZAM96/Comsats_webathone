-- Phase 07 (failure-resilient exams), Phase 08 (monitoring + announcements),
-- Phase 09 (grading + results).

-- Scores become fractional (partial credit, manual marks in 0.25 steps).
ALTER TABLE "answer"
  ALTER COLUMN "score" SET DATA TYPE DOUBLE PRECISION USING "score"::double precision;
ALTER TABLE "exam_attempt"
  ALTER COLUMN "autoScore" SET DATA TYPE DOUBLE PRECISION USING "autoScore"::double precision,
  ALTER COLUMN "totalScore" SET DATA TYPE DOUBLE PRECISION USING "totalScore"::double precision;

-- AlterTable answer
ALTER TABLE "answer" ADD COLUMN "autoScore" DOUBLE PRECISION,
ADD COLUMN "clientSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "feedback" TEXT,
ADD COLUMN "gradedAt" TIMESTAMP(3),
ADD COLUMN "gradedById" TEXT,
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "manualScore" DOUBLE PRECISION,
ADD COLUMN "requiresManual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "serverUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable exam
ALTER TABLE "exam" ADD COLUMN "passMarkPercent" INTEGER,
ADD COLUMN "resultReveal" TEXT NOT NULL DEFAULT 'score_and_answers',
ADD COLUMN "resultsPublishedAt" TIMESTAMP(3),
ADD COLUMN "resultsPublishedById" TEXT;

-- AlterTable exam_attempt
ALTER TABLE "exam_attempt" ADD COLUMN "clientOnline" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "gradedAt" TIMESTAMP(3),
ADD COLUMN "gradedById" TEXT,
ADD COLUMN "lastSeenAt" TIMESTAMP(3),
ADD COLUMN "lastSyncAt" TIMESTAMP(3),
ADD COLUMN "manualScore" DOUBLE PRECISION,
ADD COLUMN "pendingLocal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "submitSource" TEXT;

-- CreateTable
CREATE TABLE "grade_audit" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "answerId" TEXT,
    "action" TEXT NOT NULL,
    "previousScore" DOUBLE PRECISION,
    "newScore" DOUBLE PRECISION,
    "reason" TEXT,
    "gradedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grade_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_event" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_incident" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "attemptId" TEXT,
    "candidateId" TEXT,
    "reportedById" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'low',
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolutionNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_announcement" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'info',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retractedAt" TIMESTAMP(3),

    CONSTRAINT "exam_announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_read" (
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_read_pkey" PRIMARY KEY ("announcementId","userId")
);

-- CreateIndex
CREATE INDEX "grade_audit_examId_createdAt_idx" ON "grade_audit"("examId", "createdAt");
CREATE INDEX "grade_audit_answerId_idx" ON "grade_audit"("answerId");
CREATE INDEX "attempt_event_examId_createdAt_idx" ON "attempt_event"("examId", "createdAt");
CREATE INDEX "attempt_event_attemptId_createdAt_idx" ON "attempt_event"("attemptId", "createdAt");
CREATE INDEX "exam_incident_examId_status_idx" ON "exam_incident"("examId", "status");
CREATE INDEX "exam_incident_attemptId_idx" ON "exam_incident"("attemptId");
CREATE INDEX "exam_announcement_examId_createdAt_idx" ON "exam_announcement"("examId", "createdAt");
CREATE INDEX "announcement_read_userId_idx" ON "announcement_read"("userId");

-- AddForeignKey
ALTER TABLE "exam" ADD CONSTRAINT "exam_resultsPublishedById_fkey" FOREIGN KEY ("resultsPublishedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exam_attempt" ADD CONSTRAINT "exam_attempt_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "answer" ADD CONSTRAINT "answer_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "grade_audit" ADD CONSTRAINT "grade_audit_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grade_audit" ADD CONSTRAINT "grade_audit_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grade_audit" ADD CONSTRAINT "grade_audit_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attempt_event" ADD CONSTRAINT "attempt_event_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "exam_attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attempt_event" ADD CONSTRAINT "attempt_event_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_incident" ADD CONSTRAINT "exam_incident_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_incident" ADD CONSTRAINT "exam_incident_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "exam_attempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exam_incident" ADD CONSTRAINT "exam_incident_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exam_incident" ADD CONSTRAINT "exam_incident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exam_incident" ADD CONSTRAINT "exam_incident_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exam_announcement" ADD CONSTRAINT "exam_announcement_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_announcement" ADD CONSTRAINT "exam_announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "announcement_read" ADD CONSTRAINT "announcement_read_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "exam_announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_read" ADD CONSTRAINT "announcement_read_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: existing auto scores become the auto component.
UPDATE "answer" SET "autoScore" = "score" WHERE "score" IS NOT NULL;

-- Backfill: non-blank answers to manual-mode snapshots need a human mark.
UPDATE "answer" a
SET "requiresManual" = true, "score" = NULL, "autoScore" = NULL
FROM "attempt_question" q, "exam_attempt" t
WHERE a."attemptQuestionId" = q."id"
  AND a."attemptId" = t."id"
  AND t."status" <> 'in_progress'
  AND (q."type" = 'long_answer' OR q."markingScheme" LIKE '%"mode":"manual"%')
  AND btrim(COALESCE(a."text", '')) <> '';

-- Backfill: finished attempts with no pending manual answers are fully graded.
UPDATE "exam_attempt" t
SET "status" = 'graded', "gradedAt" = COALESCE(t."submittedAt", CURRENT_TIMESTAMP)
WHERE t."status" = 'submitted'
  AND NOT EXISTS (
    SELECT 1 FROM "answer" a
    WHERE a."attemptId" = t."id" AND a."requiresManual" = true AND a."manualScore" IS NULL
  );

-- Backfill: attempts still waiting on manual marks have no final total yet.
UPDATE "exam_attempt" t
SET "totalScore" = NULL
WHERE t."status" = 'submitted'
  AND EXISTS (
    SELECT 1 FROM "answer" a
    WHERE a."attemptId" = t."id" AND a."requiresManual" = true AND a."manualScore" IS NULL
  );
