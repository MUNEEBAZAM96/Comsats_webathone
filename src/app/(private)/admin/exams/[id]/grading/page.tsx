import type { Metadata } from "next";
import { GradingPage } from "@/components/Grading/GradingPage";
import { requireRole } from "@/server/session";

export const metadata: Metadata = {
  title: "Grading",
  description: "Mark written answers, review overrides and publish results",
};

const AdminGradingPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRole("admin");
  const { id } = await params;
  return (
    <GradingPage
      examId={id}
      basePath="/admin"
    />
  );
};

export default AdminGradingPage;
