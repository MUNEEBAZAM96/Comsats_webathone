import type { Metadata } from "next";
import ExamPreview from "@/components/Exam/Builder/ExamPreview";
import { getExamCandidatePreview } from "@/server/examPreviewActions";
import { requireRole } from "@/server/session";

export const metadata: Metadata = {
  title: "Exam Preview",
  description: "Candidate-safe exam preview",
};

export const instant = false;

const AdminExamPreviewPage = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  await requireRole("admin");
  const { id } = await params;
  const exam = await getExamCandidatePreview(id);

  return (
    <ExamPreview
      basePath="/admin"
      exam={exam}
    />
  );
};

export default AdminExamPreviewPage;
