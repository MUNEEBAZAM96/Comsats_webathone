import type { Metadata } from "next";
import ExamBuilder from "@/components/Exam/Builder/ExamBuilder";
import { mapExamToBuilder } from "@/components/Exam/Builder/mapExamToBuilder";
import { getExamById } from "@/server/examActions";
import { requireRole } from "@/server/session";

export const metadata: Metadata = {
  title: "Exam Builder",
  description: "Multi-step paper setting workspace",
};

export const instant = false;

const AdminExamBuilderPage = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  await requireRole("admin");
  const { id } = await params;
  const exam = await getExamById(id);

  return (
    <ExamBuilder
      basePath="/admin"
      exam={mapExamToBuilder(exam)}
    />
  );
};

export default AdminExamBuilderPage;
