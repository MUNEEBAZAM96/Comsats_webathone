ALTER TABLE "report_verification" ADD COLUMN "pdfHash" TEXT;
ALTER TABLE "report_verification" ADD COLUMN "documentVersion" TEXT;

ALTER TABLE "question" ADD COLUMN "topicName" TEXT;
ALTER TABLE "question" ADD COLUMN "subjectName" TEXT;
ALTER TABLE "attempt_question" ADD COLUMN "topicName" TEXT;
ALTER TABLE "attempt_question" ADD COLUMN "subjectName" TEXT;
