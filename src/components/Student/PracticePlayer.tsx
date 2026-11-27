"use client";

import { useState } from "react";
import { Button } from "@/components/shadcnui/button";
import { QuestionCard } from "./QuestionCard";

const questions = [
  {
    id: "practice-single",
    type: "single_choice",
    text: "Which number is even?",
    options: "Three\nFour\nFive",
    points: 1,
  },
  {
    id: "practice-multiple",
    type: "multiple_choice",
    text: "Select the primary colors of light.",
    options: "Red\nGreen\nBlue\nYellow",
    points: 1,
  },
  {
    id: "practice-true-false",
    type: "true_false",
    text: "A triangle has three sides.",
    options: null,
    points: 1,
  },
  {
    id: "practice-short",
    type: "short_answer",
    text: "Describe one way to conserve water.",
    options: null,
    points: 1,
  },
];

export const PracticePlayer = () => {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);
  const question = questions[index]!;

  return (
    <section className="mx-auto grid w-full max-w-3xl gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Practice exam</h1>
        <p className="text-muted-foreground">
          These sample questions are ungraded. Your practice stays in this tab.
        </p>
      </div>
      {finished ? (
        <div className="grid justify-items-start gap-4 rounded-lg border bg-card p-5">
          <p role="status">
            Practice complete. You answered{" "}
            {Object.values(answers).filter((answer) => answer.trim()).length} of{" "}
            {questions.length} questions.
          </p>
          <Button
            onClick={() => {
              setIndex(0);
              setAnswers({});
              setFlagged([]);
              setFinished(false);
            }}
          >
            Start again
          </Button>
        </div>
      ) : (
        <>
          <nav aria-label="Practice questions" className="flex flex-wrap gap-2">
            {questions.map(({ id }, i) => (
              <Button
                key={id}
                variant={i === index ? "default" : "outline"}
                aria-current={i === index ? "step" : undefined}
                onClick={() => setIndex(i)}
              >
                {i + 1}
                {flagged.includes(id) && (
                  <span aria-label="marked for review">⚑</span>
                )}
              </Button>
            ))}
          </nav>
          <div className="rounded-lg border bg-card p-5">
            <QuestionCard
              key={question.id}
              question={question}
              value={answers[question.id] ?? ""}
              onChange={(value) =>
                setAnswers((previous) => ({
                  ...previous,
                  [question.id]: value,
                }))
              }
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={index === questions.length - 1}
              onClick={() => setIndex(index + 1)}
            >
              Next
            </Button>
            <Button
              variant="outline"
              aria-pressed={flagged.includes(question.id)}
              onClick={() =>
                setFlagged((ids) =>
                  ids.includes(question.id)
                    ? ids.filter((id) => id !== question.id)
                    : [...ids, question.id],
                )
              }
            >
              Mark for review
            </Button>
            <Button onClick={() => setFinished(true)}>Finish practice</Button>
          </div>
        </>
      )}
    </section>
  );
};
