"use client";

import type { Route } from "next";
import Link from "next/link";
import { format } from "date-fns";
import {
  ArrowLeftIcon,
  ClockIcon,
  EyeOffIcon,
  ShuffleIcon,
} from "lucide-react";
import { Badge } from "@/components/shadcnui/badge";
import { Button } from "@/components/shadcnui/button";
import { QuestionCard } from "@/components/Student/QuestionCard";
import {
  DIFFICULTY_LABEL,
  QUESTION_TYPE_LABEL,
} from "./questionLabels";

export type PreviewQuestion = {
  id: string;
  text: string;
  type: string;
  options: string | null;
  points: number;
  order: number;
  difficulty?: string | null;
  sectionId?: string | null;
  section?: {
    id: string;
    title: string;
    instructions: string | null;
    order: number;
  } | null;
};

export type PreviewSection = {
  id: string;
  title: string;
  instructions: string | null;
  order: number;
};

type ExamPreviewProps = {
  basePath: "/admin" | "/examiner";
  exam: {
    id: string;
    title: string;
    instructions: string | null;
    duration: number;
    startTime: Date | string | null;
    endTime: Date | string | null;
    totalMarks: number;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    status: string;
    sections: PreviewSection[];
    questions: PreviewQuestion[];
  };
};

const ExamPreview = ({ basePath, exam }: ExamPreviewProps) => {
  const unsectioned = exam.questions.filter((q) => !q.sectionId);
  const bySection = exam.sections
    .map((section) => ({
      section,
      questions: exam.questions.filter((q) => q.sectionId === section.id),
    }))
    .filter((block) => block.questions.length > 0);

  const blocks = [
    ...bySection.map(({ section, questions }) => ({
      key: section.id,
      title: section.title,
      instructions: section.instructions,
      questions,
    })),
    ...(unsectioned.length > 0 ?
      [
        {
          key: "unsectioned",
          title: exam.sections.length > 0 ? "Other questions" : "Questions",
          instructions: null as string | null,
          questions: unsectioned,
        },
      ]
    : []),
  ];

  const numberedBlocks = blocks.reduce<
    Array<(typeof blocks)[number] & { startIndex: number }>
  >((acc, block) => {
    const startIndex =
      acc.length === 0 ? 0 : (
        acc[acc.length - 1]!.startIndex + acc[acc.length - 1]!.questions.length
      );
    acc.push({ ...block, startIndex });
    return acc;
  }, []);

  return (
    <section className="mx-auto grid max-w-3xl gap-6 pb-16">
      <div className="bg-warning/15 text-warning-foreground border-warning/30 flex items-start gap-3 rounded-3xl border px-4 py-3 text-sm">
        <EyeOffIcon className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-medium">Candidate preview</p>
          <p className="opacity-90">
            This is how students see the paper. Answers and marking schemes are
            hidden. No attempt is started.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href={`${basePath}/exams/${exam.id}/builder` as Route}>
            <Button
              variant="outline"
              size="icon-lg"
              aria-label="Back to builder">
              <ArrowLeftIcon className="size-4" />
            </Button>
          </Link>
          <div className="grid gap-1">
            <h1 className="text-2xl font-medium wrap-anywhere">{exam.title}</h1>
            <p className="text-muted-foreground text-sm">
              Status: {exam.status} · {exam.questions.length} questions ·{" "}
              {exam.totalMarks} marks
            </p>
          </div>
        </div>
        <Link href={`${basePath}/exams/${exam.id}/builder` as Route}>
          <Button
            variant="outline"
            size="lg">
            Return to builder
          </Button>
        </Link>
      </div>

      <div className="border-border bg-card grid gap-3 rounded-3xl border p-5 text-sm">
        <p className="flex items-center gap-2">
          <ClockIcon className="size-4" />
          Time limit: {exam.duration} minutes
          {exam.startTime && exam.endTime ?
            ` · Window ${format(new Date(exam.startTime), "MMM d, yyyy HH:mm")} → ${format(new Date(exam.endTime), "MMM d, yyyy HH:mm")}`
          : ""}
        </p>
        <p className="flex flex-wrap gap-2">
          {exam.shuffleQuestions ?
            <Badge variant="outline">
              <ShuffleIcon className="mr-1 size-3" /> Questions shuffled per
              attempt
            </Badge>
          : <Badge variant="secondary">Fixed question order</Badge>}
          {exam.shuffleOptions ?
            <Badge variant="outline">
              <ShuffleIcon className="mr-1 size-3" /> Options shuffled per
              attempt
            </Badge>
          : <Badge variant="secondary">Fixed option order</Badge>}
          <Badge variant="secondary">Auto-submit at timer expiry</Badge>
          <Badge variant="secondary">Scratchpad available in workspace</Badge>
          <Badge variant="secondary">All questions on one scrollable paper</Badge>
        </p>
        {exam.instructions ?
          <div className="grid gap-1">
            <p className="font-medium">Instructions</p>
            <p className="text-muted-foreground whitespace-pre-wrap">
              {exam.instructions}
            </p>
          </div>
        : null}
      </div>

      {numberedBlocks.map((block) => (
        <section
          key={block.key}
          className="grid gap-4">
          <div className="grid gap-1">
            <h2 className="text-lg font-medium">{block.title}</h2>
            {block.instructions ?
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                {block.instructions}
              </p>
            : null}
          </div>
          <ol className="grid gap-4">
            {block.questions.map((q, i) => (
              <li
                key={q.id}
                className="border-border bg-card grid gap-3 rounded-3xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-muted flex size-7 items-center justify-center rounded-full text-xs font-medium">
                    {block.startIndex + i + 1}
                  </span>
                  <Badge variant="secondary">
                    {QUESTION_TYPE_LABEL[q.type] ?? q.type}
                  </Badge>
                  <Badge variant="outline">
                    {DIFFICULTY_LABEL[q.difficulty ?? "medium"]}
                  </Badge>
                  <Badge variant="outline">
                    {q.points} pt{q.points === 1 ? "" : "s"}
                  </Badge>
                </div>
                <QuestionCard
                  question={{
                    id: q.id,
                    text: q.text,
                    type: q.type,
                    options: q.options,
                    points: q.points,
                  }}
                  value=""
                  onChange={() => undefined}
                />
              </li>
            ))}
          </ol>
        </section>
      ))}

      {exam.questions.length === 0 ?
        <p className="text-muted-foreground rounded-3xl border border-dashed px-6 py-12 text-center text-sm">
          No questions on this paper yet.
        </p>
      : null}
    </section>
  );
};

export default ExamPreview;
