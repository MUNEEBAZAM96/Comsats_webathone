import type { Metadata } from "next";
import { ExamResultsView } from "@/components/Results/ExamResultsView";
import { requireRole } from "@/server/session";

export const metadata: Metadata = {
  title: "Exam Results",
  description: "View exam results",
};

const ExaminerExamResultsPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRole("examiner");
  const { id } = await params;
  return (
    <ExamResultsView
      examId={id}
      basePath="/examiner"
    />
  );
};

export default ExaminerExamResultsPage;
