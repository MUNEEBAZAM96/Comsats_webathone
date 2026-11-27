"use client";

import { FileJsonIcon, FileSpreadsheetIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { NormalizedPaperQuestion } from "@/lib/exam/paperImport";
import {
  commitPaperUpload,
  previewPaperUpload,
} from "@/server/paperImportActions";
import { Badge } from "@/components/shadcnui/badge";
import { Button } from "@/components/shadcnui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcnui/dialog";
import { QUESTION_TYPE_LABEL } from "./questionLabels";

type PaperImportPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: string;
  onImported: () => void;
};

const PaperImportPanel = ({
  open,
  onOpenChange,
  examId,
  onImported,
}: PaperImportPanelProps) => {
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [questions, setQuestions] = useState<NormalizedPaperQuestion[]>([]);
  const [issues, setIssues] = useState<
    { row: number; field?: string; message: string }[]
  >([]);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [canImport, setCanImport] = useState(false);

  const reset = () => {
    setQuestions([]);
    setIssues([]);
    setDuplicates([]);
    setCanImport(false);
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    const format =
      lower.endsWith(".json") ? "json"
      : lower.endsWith(".csv") ? "csv"
      : null;
    if (!format) {
      toast.error("Upload a .csv or .json paper file");
      return;
    }
    if (file.size > 1_500_000) {
      toast.error("File must be under 1.5 MB");
      return;
    }

    setPreviewing(true);
    try {
      const content = await file.text();
      const result = await previewPaperUpload({ examId, format, content });
      setQuestions(result.questions);
      setIssues(result.issues);
      setDuplicates(result.duplicates);
      setCanImport(result.canImport && result.duplicates.length === 0);
      if (result.issues.length > 0)
        toast.error(`${result.issues.length} validation issue(s) found`);
      else if (result.duplicates.length > 0)
        toast.error("Duplicate questions detected — remove them before import");
      else toast.success(`Parsed ${result.questions.length} question(s)`);
    } catch (e) {
      reset();
      toast.error(e instanceof Error ? e.message : "Failed to parse file");
    } finally {
      setPreviewing(false);
    }
  };

  const removeRow = (index: number) => {
    setQuestions((prev) => {
      const next = prev.filter((_, i) => i !== index);
      setCanImport(next.length > 0 && issues.length === 0);
      return next;
    });
  };

  const commit = async () => {
    setCommitting(true);
    try {
      const result = await commitPaperUpload({ examId, questions });
      toast.success(`Imported ${result.imported} question(s)`);
      reset();
      onOpenChange(false);
      onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Upload paper (CSV / JSON)</DialogTitle>
          <DialogDescription>
            Preview and validate before importing. Publishing is never automatic.
            PDF/DOCX parsing is a future extension — not available yet.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <label className="inline-flex">
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={previewing}
              onClick={(e) => {
                const input = (e.currentTarget.parentElement as HTMLLabelElement)
                  .querySelector("input");
                input?.click();
              }}>
              {previewing ?
                <Loader2Icon className="size-4 animate-spin" />
              : <FileSpreadsheetIcon className="size-4" />}
              CSV
            </Button>
          </label>
          <label className="inline-flex">
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={previewing}
              onClick={(e) => {
                const input = (e.currentTarget.parentElement as HTMLLabelElement)
                  .querySelector("input");
                input?.click();
              }}>
              {previewing ?
                <Loader2Icon className="size-4 animate-spin" />
              : <FileJsonIcon className="size-4" />}
              JSON
            </Button>
          </label>
        </div>

        <p className="text-muted-foreground text-xs">
          CSV columns: section, text, type, options, answer, points, difficulty,
          keywords. Options may use newlines or |.
        </p>

        {issues.length > 0 ?
          <ul className="border-destructive/30 bg-destructive/5 max-h-32 overflow-auto rounded-2xl border p-3 text-sm">
            {issues.map((issue, i) => (
              <li key={`${issue.row}-${i}`}>
                Row {issue.row}
                {issue.field ? ` · ${issue.field}` : ""}: {issue.message}
              </li>
            ))}
          </ul>
        : null}

        {duplicates.length > 0 ?
          <p className="text-destructive text-sm">
            Duplicates: {duplicates.slice(0, 5).join("; ")}
            {duplicates.length > 5 ? "…" : ""}
          </p>
        : null}

        <div className="min-h-0 flex-1 overflow-auto">
          {questions.length === 0 ?
            <p className="text-muted-foreground py-8 text-center text-sm">
              Choose a file to preview parsed questions.
            </p>
          : <ul className="grid gap-2">
              {questions.map((q, index) => (
                <li
                  key={`${q.text}-${index}`}
                  className="border-border flex items-start justify-between gap-3 rounded-2xl border px-3 py-2 text-sm">
                  <div className="grid min-w-0 gap-1">
                    <p className="font-medium wrap-anywhere">{q.text}</p>
                    <div className="flex flex-wrap gap-1">
                      {q.section ?
                        <Badge variant="outline">{q.section}</Badge>
                      : null}
                      <Badge variant="secondary">
                        {QUESTION_TYPE_LABEL[q.type] ?? q.type}
                      </Badge>
                      <Badge variant="outline">{q.points} pts</Badge>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => removeRow(index)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          }
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="lg"
            disabled={!canImport || committing || questions.length === 0}
            onClick={() => void commit()}>
            {committing ?
              <Loader2Icon className="size-4 animate-spin" />
            : null}
            Import {questions.length || ""} into draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PaperImportPanel;
