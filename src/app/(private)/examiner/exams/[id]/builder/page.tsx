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

const ExaminerExamBuilderPage = async ({
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
      exam={mapExamToBuilder(exam)}
    />
  );
};

export default ExaminerExamBuilderPage;
