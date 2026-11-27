"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeftIcon,
  BarChart3Icon,
  CheckCircle2Icon,
  ClipboardCheckIcon,
  EyeIcon,
  Loader2Icon,
  RocketIcon,
  UsersIcon,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import ExamForm from "@/components/Exam/ExamForm";
import { Badge } from "@/components/shadcnui/badge";
import { Button } from "@/components/shadcnui/button";
import {
  evaluateBlueprint,
  parseExamBlueprint,
  readinessPercent as softReadinessPercent,
} from "@/lib/exam/blueprint";
import { evaluatePublishReadiness } from "@/lib/exam/publishReadiness";
import type { ExamFormType } from "@/lib/zodSchema";
import { publishExam, updateExam } from "@/server/examActions";
import { saveExamBlueprint } from "@/server/blueprintActions";
import ExamBuilderSummary from "./ExamBuilderSummary";
import QuestionSetPanel from "./QuestionSetPanel";
import {
  BUILDER_STEPS,
  type BuilderQuestion,
  type BuilderSection,
  type BuilderStep,
} from "./questionLabels";

export type ExamBuilderExam = {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  duration: number;
  startTime: Date | string | null;
  endTime: Date | string | null;
  status: string;
  totalMarks: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  resultReveal: string;
  passMarkPercent: number | null;
  blueprintJson?: string | null;
  createdBy?: { name: string } | null;
  questions: BuilderQuestion[];
  sections?: BuilderSection[];
};

type ExamBuilderProps = {
  exam: ExamBuilderExam;
  basePath: "/admin" | "/examiner";
};

const toLocalInput = (value: Date | string | null | undefined) => {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM-dd'T'HH:mm");
};

const ExamBuilder = ({ exam, basePath }: ExamBuilderProps) => {
  const router = useRouter();
  const [step, setStep] = useState<BuilderStep>(
    exam.status === "draft" ? "details" : "review",
  );
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [focusQuestionId, setFocusQuestionId] = useState<string | null>(null);
  const [publishing, startPublish] = useTransition();
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const readOnly = exam.status !== "draft";

  const formDefaults: Partial<ExamFormType> = {
    title: exam.title,
    description: exam.description ?? "",
    instructions: exam.instructions ?? "",
    duration: exam.duration,
    startTime: toLocalInput(exam.startTime),
    endTime: toLocalInput(exam.endTime),
    shuffleQuestions: exam.shuffleQuestions,
    shuffleOptions: exam.shuffleOptions,
    resultReveal: exam.resultReveal as ExamFormType["resultReveal"],
    passMarkPercent: exam.passMarkPercent ?? undefined,
  };

  const readiness = useMemo(
    () =>
      evaluatePublishReadiness({
        title: exam.title,
        duration: exam.duration,
        startTime: exam.startTime,
        endTime: exam.endTime,
        passMarkPercent: exam.passMarkPercent,
        questions: exam.questions,
      }),
    [exam],
  );

  const blueprintWarnings = useMemo(() => {
    const blueprint = parseExamBlueprint(exam.blueprintJson);
    return evaluateBlueprint(blueprint, exam.questions);
  }, [exam.blueprintJson, exam.questions]);

  const readinessPct = softReadinessPercent(
    readiness.issues.length,
    blueprintWarnings.length,
  );

  const refresh = () => router.refresh();

  const handleValidate = () => {
    if (readiness.ready) {
      toast.success("Publish checklist passed");
      setStep("review");
      return;
    }
    toast.error(readiness.issues[0]?.message ?? "Fix checklist items");
    setStep(readiness.issues[0]?.step ?? "review");
  };

  const handlePublish = () => {
    if (!readiness.ready) {
      toast.error(readiness.issues[0]?.message ?? "Exam is not ready to publish");
      setStep(readiness.issues[0]?.step ?? "review");
      return;
    }
    startPublish(async () => {
      try {
        await publishExam(exam.id);
        toast.success("Exam published");
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to publish");
      }
    });
  };

  return (
    <section className="grid gap-6 pb-28 lg:pb-8">
      <div className="border-border bg-background/95 sticky top-0 z-20 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-3xl border px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`${basePath}/exams` as Route}>
            <Button
              variant="outline"
              size="icon-lg"
              aria-label="Back to exams">
              <ArrowLeftIcon className="size-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-medium sm:text-xl">
                {exam.title}
              </h1>
              <Badge variant={exam.status === "draft" ? "secondary" : "default"}>
                {exam.status}
              </Badge>
            </div>
            <p className="text-muted-foreground text-xs sm:text-sm">
              {saveState === "saving" ?
                "Saving…"
              : saveState === "saved" || lastSavedAt ?
                `Saved${lastSavedAt ? ` · ${format(lastSavedAt, "HH:mm:ss")}` : ""}`
              : saveState === "error" ?
                "Save failed"
              : "Draft autosave via Save on each step"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${basePath}/exams/${exam.id}/preview` as Route}>
            <Button
              variant="outline"
              size="lg">
              <EyeIcon className="size-4" /> Preview
            </Button>
          </Link>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleValidate}>
            <ClipboardCheckIcon className="size-4" /> Validate
          </Button>
          {!readOnly ?
            <Button
              type="button"
              size="lg"
              disabled={!readiness.ready || publishing}
              onClick={handlePublish}>
              {publishing ?
                <Loader2Icon className="size-4 animate-spin" />
              : <RocketIcon className="size-4" />}
              Publish
            </Button>
          : null}
          <Link href={`${basePath}/exams/${exam.id}/assign` as Route}>
            <Button
              variant="outline"
              size="lg">
              <UsersIcon className="size-4" /> Assign
            </Button>
          </Link>
          <Link href={`${basePath}/exams/${exam.id}/results` as Route}>
            <Button
              variant="outline"
              size="lg">
              <BarChart3Icon className="size-4" /> Results
            </Button>
          </Link>
        </div>
      </div>

      <nav
        aria-label="Exam builder steps"
        className="border-border bg-muted/20 flex flex-wrap gap-2 rounded-3xl border p-2">
        {BUILDER_STEPS.map((item, index) => {
          const active = step === item.id;
          const stepIssues = readiness.issues.filter((i) => i.step === item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setStep(item.id)}
              className={`flex min-w-[10rem] flex-1 flex-col rounded-2xl px-3 py-2.5 text-left transition-colors ${
                active ? "bg-card shadow-sm" : "hover:bg-card/70"
              }`}
              aria-current={active ? "step" : undefined}>
              <span className="text-muted-foreground text-xs">
                Step {index + 1}
                {stepIssues.length > 0 ? ` · ${stepIssues.length} open` : ""}
              </span>
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="border-border bg-card min-w-0 rounded-3xl border p-5 sm:p-6">
          {step === "details" ?
            <ExamForm
              key={`${exam.id}-details-${exam.title}-${exam.duration}`}
              action={updateExam.bind(null, exam.id)}
              defaultValues={formDefaults}
              sections={["details"]}
              submitLabel="Save draft"
              continueLabel="Save and continue"
              onContinue={() => setStep("questions")}
              onSaved={() => {
                setLastSavedAt(new Date());
                refresh();
              }}
              onSaveStateChange={setSaveState}
              readOnly={readOnly}
            />
          : null}

          {step === "questions" ?
            <QuestionSetPanel
              examId={exam.id}
              questions={exam.questions}
              sections={exam.sections ?? []}
              readOnly={readOnly}
              onChanged={refresh}
              focusQuestionId={focusQuestionId}
            />
          : null}

          {step === "settings" ?
            <div className="grid gap-4">
              <p className="text-muted-foreground text-sm">
                Only settings backed by the live exam engine are shown:
                schedule, shuffle, pass mark, and result reveal. Auto-submit at
                expiry and the student scratchpad are always available in the
                attempt workspace.
              </p>
              <ExamForm
                key={`${exam.id}-settings-${String(exam.startTime)}-${String(exam.endTime)}`}
                action={updateExam.bind(null, exam.id)}
                defaultValues={formDefaults}
                sections={["settings"]}
                submitLabel="Save settings"
                continueLabel="Save and continue"
                onContinue={() => setStep("review")}
                onSaved={() => {
                  setLastSavedAt(new Date());
                  refresh();
                }}
                onSaveStateChange={setSaveState}
                readOnly={readOnly}
              />
            </div>
          : null}

          {step === "review" ?
            <div className="grid gap-6">
              <div className="grid gap-1">
                <h2 className="text-lg font-medium">Review and publish</h2>
                <p className="text-muted-foreground text-sm">
                  Confirm the paper, schedule, and publish readiness before going
                  live.
                </p>
              </div>

              <div className="border-border grid gap-3 rounded-3xl border p-4 text-sm">
                <p>
                  <span className="text-muted-foreground">Title: </span>
                  {exam.title}
                </p>
                <p>
                  <span className="text-muted-foreground">Questions: </span>
                  {exam.questions.length} · {readiness.totalMarks} marks
                </p>
                <p>
                  <span className="text-muted-foreground">Duration: </span>
                  {exam.duration} minutes
                </p>
                <p>
                  <span className="text-muted-foreground">Window: </span>
                  {exam.startTime && exam.endTime ?
                    `${format(new Date(exam.startTime), "MMM d, yyyy HH:mm")} → ${format(new Date(exam.endTime), "MMM d, yyyy HH:mm")}`
                  : "Not fully scheduled"}
                </p>
              </div>

              <div className="grid gap-2">
                <h3 className="font-medium">
                  Publish checklist · {readinessPct}% ready
                </h3>
                {readiness.ready ?
                  <p className="text-success flex items-center gap-2 text-sm">
                    <CheckCircle2Icon className="size-4" />
                    All publish requirements are met.
                  </p>
                : <ul className="grid gap-2">
                    {readiness.issues.map((issue) => (
                      <li key={issue.id}>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground text-left text-sm underline-offset-2 hover:underline"
                          onClick={() => {
                            setStep(issue.step);
                            if (issue.questionId) {
                              setFocusQuestionId(issue.questionId);
                              setTimeout(() => {
                                document
                                  .getElementById(
                                    `exam-question-${issue.questionId}`,
                                  )
                                  ?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "center",
                                  });
                              }, 50);
                            }
                          }}>
                          {issue.message}
                        </button>
                      </li>
                    ))}
                  </ul>
                }
              </div>

              {!readOnly ?
                <div className="border-border grid gap-3 rounded-3xl border p-4">
                  <div className="grid gap-1">
                    <h3 className="font-medium">Optional paper blueprint</h3>
                    <p className="text-muted-foreground text-sm">
                      Warnings only — does not block publish. Default target:
                      40% easy / 40% medium / 20% hard and mixed question types.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => {
                        void saveExamBlueprint(exam.id, {
                          difficulty: { easy: 40, medium: 40, hard: 20 },
                          types: {
                            single_choice: 60,
                            multiple_choice: 20,
                            short_answer: 10,
                            long_answer: 10,
                          },
                        })
                          .then(() => {
                            toast.success("Blueprint saved");
                            refresh();
                          })
                          .catch((e) =>
                            toast.error(
                              e instanceof Error ?
                                e.message
                              : "Failed to save blueprint",
                            ),
                          );
                      }}>
                      Apply default blueprint
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => {
                        void saveExamBlueprint(exam.id, null)
                          .then(() => {
                            toast.success("Blueprint cleared");
                            refresh();
                          })
                          .catch((e) =>
                            toast.error(
                              e instanceof Error ?
                                e.message
                              : "Failed to clear blueprint",
                            ),
                          );
                      }}>
                      Clear blueprint
                    </Button>
                  </div>
                  {blueprintWarnings.length > 0 ?
                    <ul className="text-muted-foreground grid gap-1 text-sm">
                      {blueprintWarnings.map((w) => (
                        <li key={w.id}>{w.message}</li>
                      ))}
                    </ul>
                  : <p className="text-muted-foreground text-sm">
                      No blueprint warnings.
                    </p>
                  }
                </div>
              : null}

              <div className="grid gap-3">
                <h3 className="font-medium">Paper preview</h3>
                <ol className="grid gap-3">
                  {exam.questions.map((q, index) => (
                    <li
                      key={q.id}
                      className="border-border rounded-2xl border px-3 py-3 text-sm">
                      <span className="text-muted-foreground mr-2">
                        {index + 1}.
                      </span>
                      {q.text}
                      <span className="text-muted-foreground ml-2">
                        ({q.points} pts)
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              {!readOnly ?
                <Button
                  type="button"
                  size="lg"
                  className="w-fit"
                  disabled={!readiness.ready || publishing}
                  title={
                    readiness.ready ?
                      "Publish exam"
                    : (readiness.issues[0]?.message ?? "Complete required items")
                  }
                  onClick={handlePublish}>
                  {publishing ?
                    <Loader2Icon className="size-4 animate-spin" />
                  : <RocketIcon className="size-4" />}
                  {publishing ? "Publishing…" : "Publish exam"}
                </Button>
              : <p className="text-muted-foreground text-sm">
                  Published and completed exams cannot be edited here.
                </p>
              }
            </div>
          : null}
        </div>

        <ExamBuilderSummary
          title={exam.title}
          status={exam.status}
          questionCount={exam.questions.length}
          totalMarks={readiness.totalMarks || exam.totalMarks}
          duration={exam.duration}
          startTime={toLocalInput(exam.startTime)}
          endTime={toLocalInput(exam.endTime)}
          issues={readiness.issues}
          readinessPercent={readinessPct}
          blueprintWarnings={blueprintWarnings}
          saveState={saveState}
          onGoToStep={setStep}
          onGoToQuestion={(questionId) => {
            setStep("questions");
            setFocusQuestionId(questionId);
            setTimeout(() => {
              document
                .getElementById(`exam-question-${questionId}`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 50);
          }}
        />
      </div>
    </section>
  );
};

export default ExamBuilder;
