import type { Metadata } from "next";
import { MonitorPage } from "@/components/Monitoring/MonitorPage";
import { requireRole } from "@/server/session";

export const metadata: Metadata = {
  title: "Monitor Exam",
  description: "Live monitoring, incidents and announcements",
};

const ProctorMonitorExamPage = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  const session = await requireRole("proctor");
  const { id } = await params;
  return (
    <MonitorPage
      examId={id}
      viewerId={session.user.id}
      backHref="/proctor/exams"
    />
  );
};

export default ProctorMonitorExamPage;
