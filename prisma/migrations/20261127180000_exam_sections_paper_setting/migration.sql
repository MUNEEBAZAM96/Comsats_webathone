-- Exam paper sections for the builder
CREATE TABLE "exam_section" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_section_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "exam_section_examId_idx" ON "exam_section"("examId");

ALTER TABLE "exam_section" ADD CONSTRAINT "exam_section_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "question" ADD COLUMN "sectionId" TEXT;

CREATE INDEX "question_sectionId_idx" ON "question"("sectionId");

ALTER TABLE "question" ADD CONSTRAINT "question_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "exam_section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attempt_question" ADD COLUMN "sectionTitle" TEXT;
ALTER TABLE "attempt_question" ADD COLUMN "sectionInstructions" TEXT;
