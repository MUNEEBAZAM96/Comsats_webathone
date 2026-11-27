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
import { Textarea } from "@/components/shadcnui/textarea";
import { cn } from "@/lib/utils";
import {
  updateIncidentStatus,
  type IncidentListItem,
} from "@/server/monitoringActions";
import { format } from "date-fns";
import { CheckIcon, EyeIcon, Loader2Icon, XIcon } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import {
  CATEGORY_LABEL,
  INCIDENT_STATUS_LABEL,
  SEVERITY_LABEL,
} from "./labels";

const SEVERITY_STYLE: Record<string, string> = {
  high: "bg-error-surface text-destructive",
  medium: "bg-warning-surface text-warning",
  low: "bg-muted text-muted-foreground",
};

const STATUS_STYLE: Record<string, string> = {
  open: "bg-info-surface text-info",
  under_review: "bg-warning-surface text-warning",
  resolved: "bg-success-surface text-success",
  dismissed: "bg-muted text-muted-foreground",
};

const Pill = ({ className, children }: { className: string; children: ReactNode }) => (
  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", className)}>
    {children}
  </span>
);

const CloseIncidentDialog = ({
  incidentId,
  outcome,
  onDone,
}: {
  incidentId: string;
  outcome: "resolved" | "dismissed";
  onDone: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (note.trim().length < 3) {
      setError("Add a short note explaining the outcome");
      return;
    }
    setSaving(true);
    const res = await updateIncidentStatus({
      incidentId,
      status: outcome,
      resolutionNote: note,
    }).catch(() => ({ ok: false as const, error: "Could not update the incident" }));
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success(outcome === "resolved" ? "Incident resolved" : "Incident dismissed");
    setOpen(false);
    setNote("");
    onDone();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="lg"
          />
        }>
        {outcome === "resolved" ?
          <CheckIcon aria-hidden="true" />
        : <XIcon aria-hidden="true" />}
        {outcome === "resolved" ? "Resolve" : "Dismiss"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {outcome === "resolved" ? "Resolve incident" : "Dismiss incident"}
          </DialogTitle>
          <DialogDescription>
            Record the outcome. The note is kept with the incident.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={submit}
          className="grid gap-4"
          noValidate>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor={`note-${incidentId}`}>Outcome note</FieldLabel>
            <Textarea
              id={`note-${incidentId}`}
              value={note}
              maxLength={2000}
              rows={4}
              onChange={(e) => {
                setNote(e.target.value);
                setError("");
              }}
              aria-invalid={Boolean(error)}
            />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <Button
            type="submit"
            size="lg"
            disabled={saving}>
            {saving && (
              <Loader2Icon
                aria-hidden="true"
                className="animate-spin"
              />
            )}
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export const IncidentList = ({
  incidents,
  canManage,
  onChanged,
}: {
  incidents: IncidentListItem[];
  canManage: boolean;
  onChanged: () => void;
}) => {
  const [busy, setBusy] = useState<string | null>(null);

  const markUnderReview = async (incidentId: string) => {
    setBusy(incidentId);
    const res = await updateIncidentStatus({ incidentId, status: "under_review" }).catch(
      () => ({ ok: false as const, error: "Could not update the incident" }),
    );
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onChanged();
  };

  if (incidents.length === 0)
    return (
      <p className="text-muted-foreground text-sm">No incidents recorded.</p>
    );

  return (
    <ul className="grid gap-3">
      {incidents.map((incident) => {
        const open = incident.status === "open" || incident.status === "under_review";
        return (
          <li
            key={incident.id}
            className="bg-card grid gap-2 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Pill className={STATUS_STYLE[incident.status] ?? "bg-muted text-muted-foreground"}>
                {INCIDENT_STATUS_LABEL[incident.status] ?? incident.status}
              </Pill>
              <Pill className={SEVERITY_STYLE[incident.severity] ?? "bg-muted text-muted-foreground"}>
                {SEVERITY_LABEL[incident.severity] ?? incident.severity}
              </Pill>
              <span className="text-sm font-medium">
                {CATEGORY_LABEL[incident.category] ?? incident.category}
              </span>
              <span className="text-muted-foreground text-xs">
                {incident.candidate ? incident.candidate.name : "Whole exam"} ·{" "}
                {format(new Date(incident.createdAt), "MMM d, h:mm a")} · by{" "}
                {incident.reportedBy.name}
              </span>
            </div>
            <p className="text-sm break-words whitespace-pre-wrap">
              {incident.description}
            </p>
            {incident.resolutionNote && (
              <p className="text-muted-foreground text-sm break-words whitespace-pre-wrap">
                <span className="font-medium">Outcome:</span> {incident.resolutionNote}
                {incident.resolvedBy && ` — ${incident.resolvedBy.name}`}
              </p>
            )}
            {open && (
              <div className="flex flex-wrap gap-2">
                {incident.status === "open" && (
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={busy === incident.id}
                    onClick={() => void markUnderReview(incident.id)}>
                    {busy === incident.id ?
                      <Loader2Icon
                        aria-hidden="true"
                        className="animate-spin"
                      />
                    : <EyeIcon aria-hidden="true" />}
                    Mark under review
                  </Button>
                )}
                {canManage && (
                  <>
                    <CloseIncidentDialog
                      incidentId={incident.id}
                      outcome="resolved"
                      onDone={onChanged}
                    />
                    <CloseIncidentDialog
                      incidentId={incident.id}
                      outcome="dismissed"
                      onDone={onChanged}
                    />
                  </>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};
