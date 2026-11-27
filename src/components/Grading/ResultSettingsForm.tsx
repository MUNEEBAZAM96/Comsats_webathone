"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon, SaveIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { RESULT_REVEAL_LABEL } from "@/components/Exam/ExamForm";
import { Button } from "@/components/shadcnui/button";
import { Field, FieldError, FieldLabel } from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
import {
  RESULT_REVEAL_OPTIONS,
  resultSettingsSchema,
  type ResultReveal,
  type ResultSettingsFormType,
} from "@/lib/zodSchema";
import { updateResultSettings } from "@/server/gradingActions";

type ResultSettingsFormProps = {
  examId: string;
  resultReveal: ResultReveal;
  passMarkPercent: number | null;
};

const ResultSettingsForm = ({
  examId,
  resultReveal,
  passMarkPercent,
}: ResultSettingsFormProps) => {
  const router = useRouter();
  const {
    control,
    handleSubmit,
    formState: { isSubmitting, isDirty, isValid },
    reset,
  } = useForm<ResultSettingsFormType>({
    resolver: zodResolver(resultSettingsSchema),
    defaultValues: { examId, resultReveal, passMarkPercent },
    mode: "all",
  });

  const onSubmit = async (data: ResultSettingsFormType) => {
    const result = await updateResultSettings(data);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Result settings saved");
    reset({ examId, ...result.data });
    router.refresh();
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      data-testid="result-settings"
      className="border-border grid gap-4 rounded-3xl border p-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
      <Controller
        name="resultReveal"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="settings-resultReveal">
              After results are published
            </FieldLabel>
            <select
              {...field}
              id="settings-resultReveal"
              aria-invalid={fieldState.invalid}
              className="border-input bg-input/30 h-10 rounded-3xl border px-3 text-sm">
              {RESULT_REVEAL_OPTIONS.map((value) => (
                <option
                  key={value}
                  value={value}>
                  {RESULT_REVEAL_LABEL[value]}
                </option>
              ))}
            </select>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        name="passMarkPercent"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="settings-passMarkPercent">Pass mark (%)</FieldLabel>
            <Input
              {...field}
              id="settings-passMarkPercent"
              type="number"
              min={0}
              max={100}
              placeholder="Optional"
              value={field.value == null ? "" : String(field.value)}
              aria-invalid={fieldState.invalid}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Button
        type="submit"
        size="lg"
        variant="outline"
        disabled={isSubmitting || !isDirty || !isValid}>
        {isSubmitting ?
          <Loader2Icon className="animate-spin" />
        : <SaveIcon />}
        Save
      </Button>
    </form>
  );
};

export default ResultSettingsForm;
