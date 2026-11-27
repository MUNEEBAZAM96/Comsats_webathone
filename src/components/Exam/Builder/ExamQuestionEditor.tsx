"use client";

import { resolveMultiSelectRule } from "@/lib/exam/grading";
import { parseMarkingScheme, splitLines } from "@/lib/exam/markingScheme";
import {
  QUESTION_TYPE_OPTIONS,
  questionFormSchema,
  type QuestionFormType,
} from "@/lib/zodSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { addQuestion, updateQuestion } from "@/server/examActions";
import { Button } from "@/components/shadcnui/button";
import { Field, FieldError, FieldLabel } from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
import { Textarea } from "@/components/shadcnui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcnui/dialog";
import { QUESTION_TYPE_LABEL, type BuilderQuestion } from "./questionLabels";

const selectClass =
  "bg-card focus-visible:border-ring focus-visible:ring-ring/30 h-11 w-full min-w-0 rounded-md border border-input px-3 py-1 text-sm outline-none focus-visible:ring-3";

type ExamQuestionEditorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: string;
  question?: BuilderQuestion | null;
  onSaved: () => void;
};

const normalizeOptions = (lines: string[]) =>
  lines.map((l) => l.trim()).filter(Boolean);

const ExamQuestionEditor = ({
  open,
  onOpenChange,
  examId,
  question,
  onSaved,
}: ExamQuestionEditorProps) => {
  const scheme = parseMarkingScheme(question?.markingScheme);
  const isEdit = !!question;

  const {
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { isSubmitting, isValid },
  } = useForm({
    resolver: zodResolver(questionFormSchema),
    defaultValues: {
      text: "",
      type: "single_choice" as QuestionFormType["type"],
      options: "Option A\nOption B",
      answer: "",
      points: 1,
      difficulty: "medium" as QuestionFormType["difficulty"],
      manualGrading: false,
      multiSelectRule: "partial" as QuestionFormType["multiSelectRule"],
      wrongPenalty: 1,
    },
    mode: "all",
  });

  useEffect(() => {
    if (!open) return;
    if (question) {
      reset({
        text: question.text,
        type: question.type as QuestionFormType["type"],
        options: question.options ?? "",
        answer: question.answer ?? "",
        points: question.points,
        difficulty:
          (question.difficulty as QuestionFormType["difficulty"]) ?? "medium",
        manualGrading:
          question.type === "short_answer" && scheme?.mode === "manual",
        multiSelectRule:
          scheme && question.type === "multiple_choice" ?
            resolveMultiSelectRule(scheme)
          : "partial",
        wrongPenalty: scheme?.wrongPenalty ?? 1,
      });
    } else {
      reset({
        text: "",
        type: "single_choice",
        options: "Option A\nOption B",
        answer: "",
        points: 1,
        difficulty: "medium",
        manualGrading: false,
        multiSelectRule: "partial",
        wrongPenalty: 1,
      });
    }
  }, [open, question, reset, scheme]);

  const type = useWatch({ control, name: "type" });
  const optionsRaw = useWatch({ control, name: "options" }) ?? "";
  const answerRaw = useWatch({ control, name: "answer" }) ?? "";
  const manualGrading = useWatch({ control, name: "manualGrading" });
  const multiSelectRule = useWatch({ control, name: "multiSelectRule" });

  const optionLines = useMemo(() => splitLines(optionsRaw), [optionsRaw]);
  const answerLines = useMemo(() => splitLines(answerRaw), [answerRaw]);
  const isManual =
    type === "long_answer" || (type === "short_answer" && !!manualGrading);
  const needsOptions =
    type === "multiple_choice" ||
    type === "single_choice" ||
    type === "true_false";

  useEffect(() => {
    if (type === "true_false") {
      setValue("options", "True\nFalse", { shouldValidate: true });
    }
  }, [type, setValue]);

  const setOptions = (next: string[]) => {
    setValue("options", normalizeOptions(next).join("\n"), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const setAnswers = (next: string[]) => {
    setValue("answer", [...new Set(normalizeOptions(next))].join("\n"), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const onSubmit = async (data: QuestionFormType) => {
    const fd = new FormData();
    fd.set("text", data.text);
    fd.set("type", data.type);
    fd.set("options", data.options ?? "");
    fd.set("answer", data.answer ?? "");
    fd.set("points", String(data.points));
    fd.set("difficulty", data.difficulty ?? "medium");
    fd.set("manualGrading", data.manualGrading ? "true" : "false");
    fd.set("multiSelectRule", data.multiSelectRule ?? "");
    fd.set(
      "wrongPenalty",
      data.wrongPenalty == null ? "" : String(data.wrongPenalty),
    );
    try {
      if (isEdit && question) {
        await updateQuestion(question.id, fd);
        toast.success("Exam question updated (bank original unchanged)");
      } else {
        await addQuestion(examId, fd);
        toast.success("Question added to exam");
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save question");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit exam question" : "Create question"}
          </DialogTitle>
          <DialogDescription>
            {isEdit ?
              "Edits apply only to this exam copy. The question bank original is not changed."
            : "Create a question and add it directly to this exam draft."}
          </DialogDescription>
        </DialogHeader>

        <form
          id="exam-question-editor"
          onSubmit={handleSubmit(onSubmit)}
          className="grid gap-4"
          noValidate>
          <Controller
            name="text"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Question text</FieldLabel>
                <Textarea
                  {...field}
                  id={field.name}
                  rows={3}
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Controller
              name="type"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Type</FieldLabel>
                  <select
                    {...field}
                    id={field.name}
                    className={selectClass}
                    aria-invalid={fieldState.invalid}>
                    {QUESTION_TYPE_OPTIONS.map((value) => (
                      <option
                        key={value}
                        value={value}>
                        {QUESTION_TYPE_LABEL[value] ?? value}
                      </option>
                    ))}
                  </select>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="points"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Points</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="number"
                    min={1}
                    max={999}
                    value={String(field.value ?? "")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="difficulty"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Difficulty</FieldLabel>
                  <select
                    {...field}
                    id={field.name}
                    className={selectClass}
                    aria-invalid={fieldState.invalid}>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </div>

          {needsOptions ?
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-2">
                <FieldLabel>Options</FieldLabel>
                {type !== "true_false" ?
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() =>
                      setOptions([...optionLines, `Option ${optionLines.length + 1}`])
                    }>
                    <PlusIcon className="size-4" /> Add option
                  </Button>
                : null}
              </div>
              {optionLines.map((opt, index) => {
                const checked =
                  type === "multiple_choice" ?
                    answerLines.includes(opt)
                  : answerLines[0] === opt;
                return (
                  <div
                    key={`${index}-${opt}`}
                    className="flex items-center gap-2">
                    <input
                      type={type === "multiple_choice" ? "checkbox" : "radio"}
                      name="correct-option"
                      checked={checked}
                      aria-label={`Mark option ${index + 1} correct`}
                      onChange={() => {
                        if (type === "multiple_choice") {
                          setAnswers(
                            checked ?
                              answerLines.filter((a) => a !== opt)
                            : [...answerLines, opt],
                          );
                        } else {
                          setAnswers([opt]);
                        }
                      }}
                      className="accent-primary size-4"
                    />
                    <Input
                      value={opt}
                      onChange={(e) => {
                        const next = [...optionLines];
                        const prev = next[index]!;
                        next[index] = e.target.value;
                        setOptions(next);
                        if (answerLines.includes(prev)) {
                          setAnswers(
                            answerLines.map((a) => (a === prev ? e.target.value : a)),
                          );
                        }
                      }}
                      aria-label={`Option ${index + 1}`}
                    />
                    {type !== "true_false" ?
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-lg"
                          aria-label="Move option up"
                          disabled={index === 0}
                          onClick={() => {
                            if (index === 0) return;
                            const next = [...optionLines];
                            [next[index - 1], next[index]] = [
                              next[index]!,
                              next[index - 1]!,
                            ];
                            setOptions(next);
                          }}>
                          <ArrowUpIcon className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-lg"
                          aria-label="Move option down"
                          disabled={index === optionLines.length - 1}
                          onClick={() => {
                            if (index >= optionLines.length - 1) return;
                            const next = [...optionLines];
                            [next[index], next[index + 1]] = [
                              next[index + 1]!,
                              next[index]!,
                            ];
                            setOptions(next);
                          }}>
                          <ArrowDownIcon className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-lg"
                          aria-label="Remove option"
                          disabled={optionLines.length <= 2}
                          onClick={() => {
                            const removed = optionLines[index]!;
                            setOptions(optionLines.filter((_, i) => i !== index));
                            setAnswers(answerLines.filter((a) => a !== removed));
                          }}>
                          <Trash2Icon className="size-4" />
                        </Button>
                      </>
                    : null}
                  </div>
                );
              })}
              <p className="text-muted-foreground text-xs">
                {type === "multiple_choice" ?
                  "Select every correct option. Partial credit rules apply below."
                : "Select exactly one correct option."}
              </p>
            </div>
          : null}

          {type === "multiple_choice" ?
            <div className="grid gap-3 sm:grid-cols-2">
              <Controller
                name="multiSelectRule"
                control={control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Grading rule</FieldLabel>
                    <select
                      {...field}
                      id={field.name}
                      value={field.value ?? "partial"}
                      className={selectClass}>
                      <option value="all_or_nothing">All or nothing</option>
                      <option value="partial">Partial credit</option>
                      <option value="partial_with_penalty">
                        Partial with wrong-answer penalty
                      </option>
                    </select>
                  </Field>
                )}
              />
              {multiSelectRule === "partial_with_penalty" ?
                <Controller
                  name="wrongPenalty"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>Wrong-answer penalty</FieldLabel>
                      <Input
                        {...field}
                        id={field.name}
                        type="number"
                        min={0}
                        max={1}
                        step={0.1}
                        value={String(field.value ?? "")}
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              : null}
            </div>
          : null}

          {type === "short_answer" ?
            <>
              <Controller
                name="manualGrading"
                control={control}
                render={({ field }) => (
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={!!field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      className="accent-primary size-4"
                    />
                    Mark this short answer by hand
                  </label>
                )}
              />
              {!manualGrading ?
                <Controller
                  name="answer"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>Keywords</FieldLabel>
                      <Textarea
                        {...field}
                        id={field.name}
                        rows={2}
                        placeholder={"queue\nFIFO"}
                        aria-invalid={fieldState.invalid}
                      />
                      <p className="text-muted-foreground text-xs">
                        One keyword per line. Score is proportional to keyword hits
                        unless you choose manual grading.
                      </p>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              : <p className="text-muted-foreground text-sm">
                  This question will stay unmarked until an examiner grades it.
                </p>
              }
            </>
          : null}

          {type === "long_answer" ?
            <div className="border-border bg-muted/30 rounded-2xl border p-3 text-sm">
              Long answers are always marked by hand. Candidates will see a writing
              area; automatic grading is never applied.
            </div>
          : null}

          {isManual && type !== "short_answer" ?
            <Controller
              name="answer"
              control={control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>
                    Grader guidance (optional)
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id={field.name}
                    rows={2}
                    placeholder="Notes for the marker"
                  />
                </Field>
              )}
            />
          : null}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="exam-question-editor"
            size="lg"
            disabled={isSubmitting || !isValid}>
            {isSubmitting ?
              <>
                <Loader2Icon className="size-4 animate-spin" /> Saving…
              </>
            : isEdit ?
              "Save changes"
            : "Add to exam"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExamQuestionEditor;
