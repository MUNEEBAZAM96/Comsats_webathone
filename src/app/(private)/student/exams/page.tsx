import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getStudentExams } from "@/server/studentExamActions";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/shadcnui/card";
import { StudentExamCard } from "@/components/Student/StudentExamCard";
import { groupCandidateExams } from "@/lib/exam/candidateBuckets";
import { requireRole } from "@/server/session";

export const metadata: Metadata = {
  title: "My examinations",
  description: "View your exams",
};

const ExamSection = ({
  title,
  description,
  empty,
  children,
  count,
}: {
  title: string;
  description: string;
  empty: string;
  count: number;
  children: ReactNode;
}) => (
  <section
    className="grid gap-4"
    aria-labelledby={`${title}-heading`}>
    <header className="grid gap-1">
      <h2
        id={`${title}-heading`}
        className="text-lg font-medium">
        {title} <span className="text-muted-foreground">({count})</span>
      </h2>
      <p className="text-muted-foreground text-sm">{description}</p>
    </header>
    {count === 0 ?
      <p className="text-muted-foreground rounded-3xl border border-dashed p-6 text-sm">
        {empty}
      </p>
    : <div className="grid gap-4 xl:grid-cols-2">{children}</div>}
  </section>
);

const StudentExamsPage = async () => {
  await requireRole("student");
  const { exams } = await getStudentExams();
  const { available, upcoming, completed } = groupCandidateExams(exams);

  return (
    <section className="grid gap-8">
      <header className="grid gap-2">
        <h1>My examinations</h1>
        <p className="text-muted-foreground">
          Exam windows and deadlines are set by the server. Your device clock
          does not change when an exam opens or closes.
        </p>
      </header>

      {exams.length === 0 ?
        <Card>
          <CardHeader>
            <CardTitle>No examinations assigned</CardTitle>
            <CardDescription>
              Assigned examinations will appear here. Contact your examiner if
              you expected one.
            </CardDescription>
          </CardHeader>
        </Card>
      : <>
          <ExamSection
            title="Available"
            description="Open now. Start a new exam or resume one in progress."
            empty="No examinations are open right now."
            count={available.length}>
            {available.map((exam) => (
              <StudentExamCard
                key={exam.id}
                exam={exam}
              />
            ))}
          </ExamSection>

          <ExamSection
            title="Upcoming"
            description="Scheduled examinations that have not opened yet."
            empty="No upcoming examinations."
            count={upcoming.length}>
            {upcoming.map((exam) => (
              <StudentExamCard
                key={exam.id}
                exam={exam}
              />
            ))}
          </ExamSection>

          <ExamSection
            title="Completed"
            description="Submitted attempts and examinations whose window has closed."
            empty="No completed examinations yet."
            count={completed.length}>
            {completed.map((exam) => (
              <StudentExamCard
                key={exam.id}
                exam={exam}
              />
            ))}
          </ExamSection>
        </>
      }
    </section>
  );
};

export default StudentExamsPage;
