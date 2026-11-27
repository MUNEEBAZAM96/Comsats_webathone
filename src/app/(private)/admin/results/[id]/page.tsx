import type { Metadata } from "next";
import { StaffResultDetailView } from "@/components/Results/StaffResultDetailView";
import { requireRole } from "@/server/session";

export const metadata: Metadata = {
  title: "Result Details",
  description: "View result details",
};

const AdminResultDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRole("admin");
  const { id } = await params;
  return (
    <StaffResultDetailView
      attemptId={id}
      basePath="/admin"
    />
  );
};

export default AdminResultDetailPage;
