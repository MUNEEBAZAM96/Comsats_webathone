"use client";

import { Button } from "@/components/shadcnui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shadcnui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/shadcnui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/shadcnui/select";
import { Textarea } from "@/components/shadcnui/textarea";
import {
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  incidentFormSchema,
  type IncidentFormType,
} from "@/lib/zodSchema";
import { createIncident } from "@/server/monitoringActions";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon, Loader2Icon, NotebookPenIcon } from "lucide-react";
import { useState, type ReactElement } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { CATEGORY_LABEL, MONITORING_DISCLAIMER, SEVERITY_LABEL } from "./labels";

type Props = {
  examId: string;
  candidate?: { id: string; name: string } | null;
  attemptId?: string | null;
  onCreated?: () => void;
  trigger?: ReactElement;
};

export const IncidentDialog = ({
  examId,
  candidate,
  attemptId,
  onCreated,
  trigger,
}: Props) => {
  const [open, setOpen] = useState(false);
  const defaults: IncidentFormType = {
    examId,
    attemptId: attemptId ?? "",
    candidateId: candidate?.id ?? "",
    category: "conduct",
    severity: "low",
    description: "",
  };
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<IncidentFormType>({
    resolver: zodResolver(incidentFormSchema),
    defaultValues: defaults,
    mode: "all",
  });

  const onSubmit = async (values: IncidentFormType) => {
    const res = await createIncident(values);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Incident recorded");
    reset(defaults);
    setOpen(false);
    onCreated?.();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button
              variant="outline"
              size="lg"
            />
          )
        }>
        {!trigger && (
          <>
            <NotebookPenIcon aria-hidden="true" /> Record incident
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record incident</DialogTitle>
          <DialogDescription>
            {candidate ?
              `Describe what you observed for ${candidate.name}.`
            : "Describe what you observed during this exam."}{" "}
            Stick to facts — the record is visible to the examiner and admins.
          </DialogDescription>
        </DialogHeader>
        <p className="bg-info-surface text-info flex gap-2 rounded-md px-3 py-2 text-xs">
          <InfoIcon
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
          {MONITORING_DISCLAIMER}
        </p>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="grid gap-5"
          noValidate>
          <div className="grid gap-5 sm:grid-cols-2">
            <Controller
              name="category"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Category</FieldLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}>
                    <SelectTrigger
                      id={field.name}
                      className="w-full"
                      aria-invalid={fieldState.invalid}>
                      <span>{CATEGORY_LABEL[field.value]}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {INCIDENT_CATEGORIES.map((c) => (
                        <SelectItem
                          key={c}
                          value={c}>
                          {CATEGORY_LABEL[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="severity"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Severity</FieldLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}>
                    <SelectTrigger
                      id={field.name}
                      className="w-full"
                      aria-invalid={fieldState.invalid}>
                      <span>{SEVERITY_LABEL[field.value]}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {INCIDENT_SEVERITIES.map((s) => (
                        <SelectItem
                          key={s}
                          value={s}>
                          {SEVERITY_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </div>
          <Controller
            name="description"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>What happened</FieldLabel>
                <Textarea
                  {...field}
                  id={field.name}
                  rows={5}
                  maxLength={2000}
                  placeholder="e.g. Candidate reported the page froze at 10:42; reloaded and continued."
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}>
            {isSubmitting ?
              <Loader2Icon
                aria-hidden="true"
                className="animate-spin"
              />
            : <NotebookPenIcon aria-hidden="true" />}
            Save incident
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
