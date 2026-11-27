"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  examFormSchema,
  ExamFormType,
  RESULT_REVEAL_OPTIONS,
  type ResultReveal,
} from "@/lib/zodSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon, SaveIcon } from "lucide-react";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "../shadcnui/button";
import { Field, FieldError, FieldLabel } from "../shadcnui/field";
import { Input } from "../shadcnui/input";
import { Textarea } from "../shadcnui/textarea";

export const RESULT_REVEAL_LABEL: Record<ResultReveal, string> = {
  none: "Withhold results",
  score_only: "Show scores and feedback",
  score_and_answers: "Show scores, feedback and correct answers",
};

type ExamFormProps = {
  action: (
    formData: FormData,
  ) => Promise<void | { id: string; basePath: string }>;
  defaultValues?: Partial<ExamFormType>;
  submitLabel?: string;
  continueLabel?: string;
  /** Which fields to render. Defaults to all. */
  sections?: Array<"details" | "settings">;
  onSaved?: () => void;
  onContinue?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSaveStateChange?: (state: "idle" | "saving" | "saved" | "error") => void;
  readOnly?: boolean;
};

const ExamForm = ({
  action,
  defaultValues,
  submitLabel = "Save draft",
  continueLabel,
  sections = ["details", "settings"],
  onSaved,
  onContinue,
  onDirtyChange,
  onSaveStateChange,
  readOnly = false,
}: ExamFormProps) => {
  const router = useRouter();
  const showDetails = sections.includes("details");
  const showSettings = sections.includes("settings");

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isValid, isDirty },
  } = useForm({
    resolver: zodResolver(examFormSchema),
    defaultValues: {
      title: defaultValues?.title ?? "",
      description: defaultValues?.description ?? "",
      instructions: defaultValues?.instructions ?? "",
      duration: defaultValues?.duration ?? 60,
      startTime: defaultValues?.startTime ?? "",
      endTime: defaultValues?.endTime ?? "",
      shuffleQuestions: defaultValues?.shuffleQuestions ?? false,
      shuffleOptions: defaultValues?.shuffleOptions ?? false,
      resultReveal: defaultValues?.resultReveal ?? "score_and_answers",
      passMarkPercent: defaultValues?.passMarkPercent,
    },
    mode: "all",
  });

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const save = async (data: ExamFormType, thenContinue = false) => {
    const fd = new FormData();
    fd.set("title", data.title);
    fd.set("description", data.description ?? "");
    fd.set("instructions", data.instructions ?? "");
    fd.set("duration", String(data.duration));
    fd.set("startTime", data.startTime ?? "");
    fd.set("endTime", data.endTime ?? "");
    fd.set("shuffleQuestions", String(data.shuffleQuestions ?? false));
    fd.set("shuffleOptions", String(data.shuffleOptions ?? false));
    fd.set("resultReveal", data.resultReveal ?? "score_and_answers");
    fd.set(
      "passMarkPercent",
      data.passMarkPercent == null ? "" : String(data.passMarkPercent),
    );
    onSaveStateChange?.("saving");
    try {
      const result = await action(fd);
      toast.success("Exam draft saved");
      onSaveStateChange?.("saved");
      onSaved?.();
      if (result && "id" in result) {
        router.push(
          `${result.basePath}/exams/${result.id}/builder` as Route,
        );
        return;
      }
      if (thenContinue) onContinue?.();
    } catch (e) {
      onSaveStateChange?.("error");
      toast.error(e instanceof Error ? e.message : "Failed to save exam");
    }
  };

  return (
    <form
      onSubmit={handleSubmit((data) => save(data, false))}
      className="grid max-w-2xl gap-6"
      noValidate>
      {showDetails ?
        <>
          <div className="grid gap-1">
            <h2 className="text-lg font-medium">Exam details</h2>
            <p className="text-muted-foreground text-sm">
              Title and guidance candidates see before they start.
            </p>
          </div>

          <Controller
            name="title"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Title</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  placeholder="Enter exam title"
                  aria-invalid={fieldState.invalid}
                  disabled={readOnly}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <Controller
            name="description"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Description</FieldLabel>
                <Textarea
                  {...field}
                  id={field.name}
                  placeholder="Short overview for staff and candidate lists (optional)"
                  aria-invalid={fieldState.invalid}
                  className="h-24"
                  disabled={readOnly}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <Controller
            name="instructions"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Candidate instructions</FieldLabel>
                <Textarea
                  {...field}
                  id={field.name}
                  placeholder="Rules and guidance shown before the exam starts"
                  aria-invalid={fieldState.invalid}
                  className="h-28"
                  disabled={readOnly}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <Controller
            name="duration"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Duration (minutes)</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  type="number"
                  min={1}
                  max={1440}
                  placeholder="60"
                  value={String(field.value ?? "")}
                  aria-invalid={fieldState.invalid}
                  disabled={readOnly}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </>
      : null}

      {showSettings ?
        <>
          <div className="grid gap-1">
            <h2 className="text-lg font-medium">Exam settings</h2>
            <p className="text-muted-foreground text-sm">
              Schedule, shuffle behaviour, and what candidates see after results.
            </p>
          </div>

          <Controller
            name="startTime"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Start time</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  type="datetime-local"
                  aria-invalid={fieldState.invalid}
                  disabled={readOnly}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <Controller
            name="endTime"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>End time</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  type="datetime-local"
                  aria-invalid={fieldState.invalid}
                  disabled={readOnly}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              name="resultReveal"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>
                    After results are published
                  </FieldLabel>
                  <select
                    {...field}
                    id={field.name}
                    value={field.value ?? "score_and_answers"}
                    aria-invalid={fieldState.invalid}
                    disabled={readOnly}
                    className="border-input bg-input/30 h-10 rounded-3xl border px-3 text-sm disabled:opacity-50">
                    {RESULT_REVEAL_OPTIONS.map((value) => (
                      <option
                        key={value}
                        value={value}>
                        {RESULT_REVEAL_LABEL[value]}
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
              name="passMarkPercent"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Pass mark (%)</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="number"
                    min={0}
                    max={100}
                    placeholder="Optional"
                    value={field.value == null ? "" : String(field.value)}
                    aria-invalid={fieldState.invalid}
                    disabled={readOnly}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </div>

          <div className="grid gap-3">
            <Controller
              name="shuffleQuestions"
              control={control}
              render={({ field }) => (
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={!!field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                    className="accent-primary size-4"
                    disabled={readOnly}
                  />
                  Shuffle question order per student
                </label>
              )}
            />
            <Controller
              name="shuffleOptions"
              control={control}
              render={({ field }) => (
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={!!field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                    className="accent-primary size-4"
                    disabled={readOnly}
                  />
                  Shuffle answer options per student
                </label>
              )}
            />
          </div>
        </>
      : null}

      {!readOnly ?
        <div className="flex flex-wrap gap-2">
          <Button
            className="w-fit"
            type="submit"
            disabled={isSubmitting || !isValid}
            aria-busy={isSubmitting}>
            {isSubmitting ?
              <>
                <Loader2Icon className="animate-spin" /> Saving…
              </>
            : <>
                <SaveIcon /> {submitLabel}
              </>
            }
          </Button>
          {continueLabel ?
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={isSubmitting || !isValid}
              onClick={handleSubmit((data) => save(data, true))}>
              {continueLabel}
            </Button>
          : null}
        </div>
      : null}

      {isDirty && !readOnly ?
        <p
          className="text-muted-foreground text-xs"
          role="status">
          You have unsaved changes.
        </p>
      : null}
    </form>
  );
};

export default ExamForm;
