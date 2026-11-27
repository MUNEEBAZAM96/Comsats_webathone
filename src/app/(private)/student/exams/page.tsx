import type { Metadata } from "next";
import Link from "next/link";
import { format, isAfter, isBefore } from "date-fns";
import { getStudentExams } from "@/server/studentExamActions";
import { Badge } from "@/components/shadcnui/badge";
import { Button } from "@/components/shadcnui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/shadcnui/card";
import { ExamStatusBadge } from "@/components/Student/ExamStatusBadge";
import { AttemptBadge } from "@/components/Student/AttemptBadge";
import { ClockIcon, EyeIcon, PlayIcon, RotateCcwIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "My examinations",
  description: "View your exams",
};

type TimeStatus = "available" | "not_yet_available" | "ended" | null;

const getTimeStatus = (exam: {
  startTime: Date | null;
  endTime: Date | null;
  status: string;
}): TimeStatus => {
  if (exam.status !== "published") return null;
  const now = new Date();
  if (exam.startTime && isBefore(now, exam.startTime))
    return "not_yet_available";
  if (exam.endTime && isAfter(now, exam.endTime)) return "ended";
  return "available";
};

const StudentExamsPage = async () => {
  const exams = await getStudentExams();

  return (
    <section className="grid gap-6">
      <header className="grid gap-2">
        <h1>My examinations</h1>
        <p className="text-muted-foreground">Review schedules and open your assigned examinations.</p>
      </header>
      {exams.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No examinations assigned</CardTitle>
            <CardDescription>
              Assigned examinations will appear here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {exams.map((exam) => {
            const attempt = exam.attempt;
            const timeStatus = getTimeStatus(exam);

            const timeBadge = () => {
              if (timeStatus === "not_yet_available")
                return (
                  <Badge className="bg-warning-surface text-warning">
                    <ClockIcon className="mr-1 size-3" /> Scheduled
                  </Badge>
                );
              if (timeStatus === "ended")
                return (
                  <Badge className="bg-muted text-muted-foreground">
                    Ended
                  </Badge>
                );
              return null;
            };

            return (
              <Card key={exam.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="grid gap-1">
                      <CardTitle className="text-lg">{exam.title}</CardTitle>
                      <CardDescription>{exam.description}</CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ExamStatusBadge status={exam.status} />
                      <AttemptBadge status={attempt?.status} />
                      {timeBadge()}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
                    <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <span>{exam.duration} min</span>
                      <span>{exam._count.questions} questions</span>
                      <span>by {exam.createdBy.name}</span>
                      {exam.startTime && (
                        <span>
                          Starts {format(exam.startTime, "MMM d, yyyy")}
                        </span>
                      )}
                      {exam.endTime && (
                        <span>Ends {format(exam.endTime, "MMM d, yyyy")}</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {exam.status === "published" &&
                        !attempt &&
                        timeStatus === "available" && (
                          <Link prefetch={false} href={`/student/exams/${exam.id}`}>
                            <Button size="lg">
                              <PlayIcon className="size-4" /> Start
                            </Button>
                          </Link>
                        )}
                      {exam.status === "published" &&
                        !attempt &&
                        timeStatus === "not_yet_available" && (
                          <Button size="lg" disabled>
                            <ClockIcon className="size-4" /> Not Yet Available
                          </Button>
                        )}
                      {exam.status === "published" &&
                        !attempt &&
                        timeStatus === "ended" && (
                          <Button size="lg" disabled>
                            Ended
                          </Button>
                        )}
                      {attempt?.status === "in_progress" && (
                        <Link prefetch={false} href={`/student/exams/${exam.id}`}>
                          <Button size="lg">
                            <RotateCcwIcon className="size-4" /> Resume
                          </Button>
                        </Link>
                      )}
                      {(attempt?.status === "submitted" ||
                        attempt?.status === "graded") && (
                        <Link href={`/student/results/${attempt.id}`}>
                          <Button variant="outline" size="lg">
                            <EyeIcon className="size-4" /> View Result
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default StudentExamsPage;
