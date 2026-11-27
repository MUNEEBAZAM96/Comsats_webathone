import type { Metadata } from "next";
import { ExamResultsView } from "@/components/Results/ExamResultsView";
import { requireRole } from "@/server/session";

export const metadata: Metadata = {
  title: "Exam Results",
  description: "View exam results",
};

const AdminExamResultsPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRole("admin");
  const { id } = await params;
  return (
    <ExamResultsView
      examId={id}
      basePath="/admin"
    />
  );
};

export default AdminExamResultsPage;
