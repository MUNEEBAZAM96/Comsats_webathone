import type { Metadata } from "next";
import { StaffResultDetailView } from "@/components/Results/StaffResultDetailView";
import { requireRole } from "@/server/session";

export const metadata: Metadata = {
  title: "Result Details",
  description: "View result details",
};

const ExaminerResultDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRole("examiner");
  const { id } = await params;
  return (
    <StaffResultDetailView
      attemptId={id}
      basePath="/examiner"
    />
  );
};

export default ExaminerResultDetailPage;
