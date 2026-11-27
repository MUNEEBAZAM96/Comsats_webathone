import type { Metadata } from "next";
import { StaffResultDetailView } from "@/components/Results/StaffResultDetailView";
import { requireRole } from "@/server/session";

export const metadata: Metadata = {
  title: "Result Details",
  description: "View result details",
};

const ProctorResultDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireRole("proctor");
  const { id } = await params;
  return (
    <StaffResultDetailView
      attemptId={id}
      basePath="/proctor"
    />
  );
};

export default ProctorResultDetailPage;
