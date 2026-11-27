"use client";

import { Textarea } from "../shadcnui/textarea";
import { Label } from "../shadcnui/label";

type QuestionCardProps = {
  question: {
    id: string;
    text: string;
    type: string;
    options: string | null;
    points: number;
  };
  value: string;
  onChange: (val: string) => void;
};

export const QuestionCard = ({
  question,
  value,
  onChange,
}: QuestionCardProps) => {
  const options = question.options
    ? question.options.split("\n").filter(Boolean)
    : [];
  const promptId = `question-${question.id}-prompt`;
  const trueFalseOptions = options.length === 2 ? options : ["True", "False"];

  const selectedValues = value ? value.split("\n").filter(Boolean) : [];

  const toggleMultiple = (opt: string) => {
    const set = new Set(selectedValues);
    if (set.has(opt)) set.delete(opt);
    else set.add(opt);
    onChange(Array.from(set).join("\n"));
  };

  const renderInput = () => {
    switch (question.type) {
      case "multiple_choice":
        return (
          <div
            role="group"
            aria-labelledby={promptId}
            aria-describedby={`${promptId}-hint`}
            className="grid gap-3">
            <p
              id={`${promptId}-hint`}
              className="text-muted-foreground text-sm">
              Select all that apply.
            </p>
            {options.map((opt) => {
              const checked = selectedValues.includes(opt);
              return (
                <Label
                  key={opt}
                  className={`hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 text-base leading-relaxed transition-colors ${
                    checked ? "border-primary bg-secondary" : "border-input"
                  }`}
                >
                  <input
                    type="checkbox"
                    value={opt}
                    checked={checked}
                    onChange={() => toggleMultiple(opt)}
                    className="accent-primary size-4"
                  />
                  <span>{opt}</span>
                </Label>
              );
            })}
          </div>
        );

      case "single_choice":
        return (
          <div
            role="radiogroup"
            aria-labelledby={promptId}
            className="grid gap-3">
            {options.map((opt) => (
              <Label
                key={opt}
                className={`hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 text-base leading-relaxed transition-colors ${
                  value === opt ? "border-primary bg-secondary" : "border-input"
                }`}
              >
                <input
                  type="radio"
                  name={question.id}
                  value={opt}
                  checked={value === opt}
                  onChange={(e) => onChange(e.target.value)}
                  className="accent-primary size-4"
                />
                <span>{opt}</span>
              </Label>
            ))}
          </div>
        );

      case "true_false":
        return (
          <div
            role="radiogroup"
            aria-labelledby={promptId}
            className="grid gap-3 sm:grid-cols-2">
            {trueFalseOptions.map((opt) => (
              <Label
                key={opt}
                className={`hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 text-base leading-relaxed transition-colors ${
                  value === opt ? "border-primary bg-secondary" : "border-input"
                }`}
              >
                <input
                  type="radio"
                  name={question.id}
                  value={opt}
                  checked={value === opt}
                  onChange={(e) => onChange(e.target.value)}
                  className="accent-primary size-4"
                />
                <span>{opt}</span>
              </Label>
            ))}
          </div>
        );

      default:
        return (
          <Textarea
            aria-labelledby={promptId}
            maxLength={50_000}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Type your answer..."
            rows={4}
            className="min-h-32"
          />
        );
    }
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-2 sm:flex-nowrap sm:gap-4">
        <p
          id={promptId}
          className="min-w-0 break-words text-lg leading-relaxed font-medium whitespace-pre-wrap sm:text-xl">
          {question.text}
        </p>
        <span className="bg-muted shrink-0 rounded-full px-3 py-1 text-xs font-medium tabular-nums">
          {question.points} {question.points === 1 ? "pt" : "pts"}
        </span>
      </div>
      {renderInput()}
    </div>
  );
};
