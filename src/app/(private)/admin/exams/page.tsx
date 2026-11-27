import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/shadcnui/button";
import ExamsTable from "@/components/Exam/ExamsTable";
import { getExams } from "@/server/examActions";
import { requireRole } from "@/server/session";

export const metadata: Metadata = {
  title: "Exams",
  description: "Manage all exams",
};

// The page reads the request-bound Better Auth session and live exam data.
export const instant = false;

const AdminExamsPage = async () => {
  await requireRole("admin");
  const exams = await getExams();

  return (
    <section className="grid gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">All Exams</h1>
        <Link href="/admin/exams/new">
          <Button>
            <PlusIcon className="size-4" /> Create Exam
          </Button>
        </Link>
      </div>
      <ExamsTable
        exams={exams}
        basePath="/admin"
      />
    </section>
  );
};

export default AdminExamsPage;
