"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ResultReview } from "@/components/Student/ResultReview";

type Detail = {
  totalScore: number | null;
  maxScore: number;
  submittedAt: string | null;
  questions: React.ComponentProps<typeof ResultReview>["questions"];
  answers: React.ComponentProps<typeof ResultReview>["answers"];
  showAnswers: boolean;
  passMarkPercent: number | null;
  summary: { answered: number; questions: number };
};

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "review", label: "Answer review" },
  { id: "feedback", label: "Feedback" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export const StudentResultTabs = ({ data }: { data: Detail }) => {
  const [tab, setTab] = useState<TabId>("overview");
  const feedbackAnswers = data.answers.filter(
    (a) =>
      Boolean(a.feedback?.trim()) ||
      (a.strengths && a.strengths.length > 0) ||
      (a.improvements && a.improvements.length > 0),
  );

  return (
    <div className="grid gap-5">
      <div
        role="tablist"
        aria-label="Result sections"
        className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={cn(
              "rounded-full border px-4 py-2 text-sm",
              tab === t.id ?
                "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:bg-muted/40",
            )}
            onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <ResultReview
          totalScore={data.totalScore}
          maxScore={data.maxScore}
          submittedAt={data.submittedAt}
          questions={[]}
          answers={[]}
          showAnswers={false}
          passMarkPercent={data.passMarkPercent}
          summary={data.summary}
        />
      )}

      {tab === "review" && (
        <ResultReview
          totalScore={data.totalScore}
          maxScore={data.maxScore}
          submittedAt={data.submittedAt}
          questions={data.questions}
          answers={data.answers}
          showAnswers={data.showAnswers}
          passMarkPercent={data.passMarkPercent}
          summary={data.summary}
        />
      )}

      {tab === "feedback" && (
        <div className="grid gap-4">
          {feedbackAnswers.length === 0 ?
            <p className="text-muted-foreground rounded-3xl border border-dashed px-4 py-10 text-center text-sm">
              No written feedback has been published for this attempt yet.
            </p>
          : feedbackAnswers.map((a) => {
              const q = data.questions.find((item) => item.id === a.questionId);
              return (
                <article
                  key={a.id}
                  className="border-border grid gap-2 rounded-3xl border p-5">
                  <p className="font-medium wrap-anywhere">
                    {q?.text ?? "Question"}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {a.score == null ? "Pending" : `${a.score}/${q?.points ?? "—"}`}
                    {a.gradingSource === "examiner" ?
                      " · Examiner reviewed"
                    : a.gradingSource === "ai_assisted" ?
                      " · AI-assisted"
                    : null}
                  </p>
                  {a.strengths && a.strengths.length > 0 ?
                    <div>
                      <p className="text-xs font-medium uppercase">Strengths</p>
                      <ul className="mt-1 list-disc pl-5 text-sm">
                        {a.strengths.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  : null}
                  {a.improvements && a.improvements.length > 0 ?
                    <div>
                      <p className="text-xs font-medium uppercase">
                        Areas for improvement
                      </p>
                      <ul className="mt-1 list-disc pl-5 text-sm">
                        {a.improvements.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  : null}
                  {a.feedback ?
                    <p className="text-sm whitespace-pre-wrap">{a.feedback}</p>
                  : null}
                </article>
              );
            })
          }
        </div>
      )}
    </div>
  );
};
