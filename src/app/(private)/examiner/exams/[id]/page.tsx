import type { Metadata } from "next";
import ExamBuilder from "@/components/Exam/Builder/ExamBuilder";
import { getExamById } from "@/server/examActions";
import { requireRole } from "@/server/session";

export const metadata: Metadata = {
  title: "Exam Builder",
  description: "Author and publish an exam",
};

export const instant = false;

const ExaminerExamDetailPage = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  await requireRole("examiner");
  const { id } = await params;
  const exam = await getExamById(id);

  return (
    <ExamBuilder
      basePath="/examiner"
      exam={{
        id: exam.id,
        title: exam.title,
        description: exam.description,
        instructions: exam.instructions,
        duration: exam.duration,
        startTime: exam.startTime,
        endTime: exam.endTime,
        status: exam.status,
        totalMarks: exam.totalMarks ?? 0,
        shuffleQuestions: exam.shuffleQuestions,
        shuffleOptions: exam.shuffleOptions,
        resultReveal: exam.resultReveal,
        passMarkPercent: exam.passMarkPercent,
        createdBy: exam.createdBy,
        questions: exam.questions,
      }}
    />
  );
};

export default ExaminerExamDetailPage;
