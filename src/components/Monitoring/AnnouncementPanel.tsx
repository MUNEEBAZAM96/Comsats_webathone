"use client";

import { Button } from "@/components/shadcnui/button";
import { Field, FieldError, FieldLabel } from "@/components/shadcnui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/shadcnui/select";
import { Textarea } from "@/components/shadcnui/textarea";
import { cn } from "@/lib/utils";
import {
  ANNOUNCEMENT_PRIORITIES,
  announcementFormSchema,
} from "@/lib/zodSchema";
import {
  createAnnouncement,
  retractAnnouncement,
  type AnnouncementListItem,
} from "@/server/monitoringActions";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { Loader2Icon, MegaphoneIcon, Undo2Icon } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

const PRIORITY_LABEL: Record<string, string> = {
  info: "Info",
  important: "Important",
  urgent: "Urgent",
};

const PRIORITY_STYLE: Record<string, string> = {
  urgent: "bg-error-surface text-destructive",
  important: "bg-warning-surface text-warning",
  info: "bg-secondary text-secondary-foreground",
};

export const AnnouncementPanel = ({
  examId,
  announcements,
  assigned,
  canSend,
  canManage,
  viewerId,
  onChanged,
}: {
  examId: string;
  announcements: AnnouncementListItem[];
  assigned: number;
  canSend: boolean;
  canManage: boolean;
  viewerId: string;
  onChanged: () => void;
}) => {
  const [retracting, setRetracting] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm({
    resolver: zodResolver(announcementFormSchema),
    defaultValues: { examId, message: "", priority: "info" as const },
    mode: "onSubmit",
  });

  const onSubmit = async (values: { examId: string; message: string; priority: "info" | "important" | "urgent" }) => {
    const res = await createAnnouncement(values).catch(() => ({
      ok: false as const,
      error: "Could not send the announcement",
    }));
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Announcement sent — candidates receive it within about 20 seconds");
    reset({ examId, message: "", priority: values.priority });
    onChanged();
  };

  const retract = async (id: string) => {
    setRetracting(id);
    const res = await retractAnnouncement(id).catch(() => ({
      ok: false as const,
      error: "Could not retract the announcement",
    }));
    setRetracting(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Announcement retracted");
    onChanged();
  };

  return (
    <div className="grid gap-5">
      {canSend ?
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="bg-card grid gap-4 rounded-lg border p-4"
          noValidate>
          <Controller
            name="message"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="announcement-message">
                  Message to all candidates
                </FieldLabel>
                <Textarea
                  {...field}
                  id="announcement-message"
                  rows={3}
                  maxLength={1000}
                  placeholder="e.g. Question 4 has a typo: read “array” as “list”."
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <div className="flex flex-wrap items-end gap-3">
            <Controller
              name="priority"
              control={control}
              render={({ field }) => (
                <Field className="w-44">
                  <FieldLabel htmlFor="announcement-priority">Priority</FieldLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}>
                    <SelectTrigger
                      id="announcement-priority"
                      className="w-full">
                      <span>{PRIORITY_LABEL[field.value ?? "info"]}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {ANNOUNCEMENT_PRIORITIES.map((p) => (
                        <SelectItem
                          key={p}
                          value={p}>
                          {PRIORITY_LABEL[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
              : <MegaphoneIcon aria-hidden="true" />}
              Send announcement
            </Button>
          </div>
        </form>
      : <p className="text-muted-foreground text-sm">
          Announcements can be sent while the exam is scheduled or running.
        </p>
      }

      {announcements.length === 0 ?
        <p className="text-muted-foreground text-sm">No announcements yet.</p>
      : <ul className="grid gap-3">
          {announcements.map((a) => {
            const canRetract =
              !a.retractedAt && (canManage || a.author.id === viewerId);
            return (
              <li
                key={a.id}
                className={cn(
                  "bg-card grid gap-2 rounded-lg border p-4",
                  a.retractedAt && "opacity-60",
                )}>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-medium",
                      PRIORITY_STYLE[a.priority] ?? PRIORITY_STYLE.info,
                    )}>
                    {PRIORITY_LABEL[a.priority] ?? a.priority}
                  </span>
                  <span className="text-muted-foreground">
                    {format(new Date(a.createdAt), "MMM d, h:mm a")} · {a.author.name}
                  </span>
                  {a.retractedAt ?
                    <span className="text-muted-foreground">· Retracted</span>
                  : <span className="text-muted-foreground">
                      · Read by {a._count.reads} of {assigned}
                    </span>
                  }
                </div>
                <p
                  className={cn(
                    "text-sm break-words whitespace-pre-wrap",
                    a.retractedAt && "line-through",
                  )}>
                  {a.message}
                </p>
                {canRetract && (
                  <div>
                    <Button
                      variant="outline"
                      size="lg"
                      disabled={retracting === a.id}
                      onClick={() => void retract(a.id)}>
                      {retracting === a.id ?
                        <Loader2Icon
                          aria-hidden="true"
                          className="animate-spin"
                        />
                      : <Undo2Icon aria-hidden="true" />}
                      Retract
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      }
    </div>
  );
};
