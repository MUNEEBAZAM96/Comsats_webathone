-- Supporting libraries: report verification + import audit

CREATE TABLE IF NOT EXISTS "report_verification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "examId" TEXT,
    "attemptId" TEXT,
    "contentHash" TEXT NOT NULL,
    "publicMeta" TEXT NOT NULL,
    "publishedById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "report_verification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "report_verification_examId_idx" ON "report_verification"("examId");
CREATE INDEX IF NOT EXISTS "report_verification_attemptId_idx" ON "report_verification"("attemptId");
CREATE INDEX IF NOT EXISTS "report_verification_contentHash_idx" ON "report_verification"("contentHash");

DO $$ BEGIN
  ALTER TABLE "report_verification" ADD CONSTRAINT "report_verification_publishedById_fkey"
    FOREIGN KEY ("publishedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "import_job" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "fileName" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "validCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "import_job_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "import_job_createdById_idx" ON "import_job"("createdById");
CREATE INDEX IF NOT EXISTS "import_job_kind_idx" ON "import_job"("kind");