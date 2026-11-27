import type { Metadata } from "next";
import { MonitorPage } from "@/components/Monitoring/MonitorPage";
import { requireRole } from "@/server/session";

export const metadata: Metadata = {
  title: "Monitor Exam",
  description: "Live monitoring, incidents and announcements",
};

// This route must read the request-bound Better Auth session before rendering.
// Allow it to block while that session check completes instead of requiring an
// instant-navigation static shell for uncached request data.
export const instant = false;

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
