import type { Metadata } from "next";
import Link from "next/link";
import { EyeIcon, FileTextIcon } from "lucide-react";
import { Button } from "@/components/shadcnui/button";
import { Card } from "@/components/shadcnui/card";
import { getProctorExams } from "@/server/proctorActions";

export const metadata: Metadata = {
  title: "Assigned Exams",
  description: "View your assigned exams",
};

const ProctorExamsPage = async () => {
  const exams = await getProctorExams();

  return (
    <section className="grid gap-8">
      <div>
        <h1 className="text-2xl font-medium">Assigned Exams</h1>
        <p className="text-muted-foreground text-sm">
          Exams you are assigned to proctor
        </p>
      </div>

      {exams.length === 0 && (
        <Card className="p-8 text-center">
          <FileTextIcon className="text-muted-foreground mx-auto mb-4 size-8" />
          <p className="text-muted-foreground">
            You haven&apos;t been assigned to any exams yet.
          </p>
        </Card>
      )}

      {exams.length > 0 && (
        <div className="grid gap-3">
          {exams.map((exam) => (
            <div
              key={exam.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 sm:gap-4">
              <div className="grid min-w-0 flex-1 basis-60 gap-1">
                <span className="wrap-anywhere text-sm font-medium">{exam.title}</span>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span>{exam._count.questions} questions</span>
                  <span>{exam._count.assignments} candidates</span>
                  <span>{exam._count.attempts} attempts</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                    {exam.status}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                size="lg"
                nativeButton={false}
                render={<Link href={`/proctor/exams/${exam.id}`} />}>
                <EyeIcon aria-hidden="true" /> Monitor
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default ProctorExamsPage;
