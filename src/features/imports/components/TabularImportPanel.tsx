"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  commitBankQuestionImport,
  commitCandidateImport,
  getCsvTemplates,
  previewBankQuestionCsv,
  previewBankQuestionXlsx,
  previewCandidateCsv,
  previewCandidateXlsx,
} from "@/server/importExportActions";
import { Button } from "@/components/shadcnui/button";

type Mode = "candidates" | "bank_questions";

const MAX_CLIENT_BYTES = 2 * 1024 * 1024;

const toBase64 = async (file: File) => {
  if (file.size > MAX_CLIENT_BYTES) throw new Error("File exceeds 2MB limit");
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of buf) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export const TabularImportPanel = ({ mode }: { mode: Mode }) => {
  const [preview, setPreview] = useState<{
    validCount: number;
    invalid: { row: number; message: string }[];
    valid: unknown[];
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_CLIENT_BYTES) {
      toast.warning("The file exceeds the 2 MB limit");
      return;
    }
    setBusy(true);
    setPreview(null);
    try {
      const isXlsx = file.name.toLowerCase().endsWith(".xlsx");
      if (mode === "candidates") {
        if (isXlsx) {
          const result = await previewCandidateXlsx(await toBase64(file));
          setPreview({
            validCount: result.valid.length,
            invalid: result.invalid,
            valid: result.valid,
          });
        } else {
          const text = await file.text();
          const result = await previewCandidateCsv(text);
          setPreview({
            validCount: result.valid.length,
            invalid: result.invalid,
            valid: result.valid,
          });
        }
      } else if (isXlsx) {
        const result = await previewBankQuestionXlsx(await toBase64(file));
        setPreview({
          validCount: result.valid.length,
          invalid: result.invalid,
          valid: result.valid,
        });
      } else {
        const text = await file.text();
        const result = await previewBankQuestionCsv(text);
        setPreview({
          validCount: result.valid.length,
          invalid: result.invalid,
          valid: result.valid,
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    }
    setBusy(false);
  };

  const commit = async () => {
    if (!preview || preview.valid.length === 0) return;
    setBusy(true);
    try {
      if (mode === "candidates") {
        const result = await commitCandidateImport(preview.valid);
        toast.success(
          `Created ${result.created}, skipped ${result.skipped} duplicates`,
        );
      } else {
        const result = await commitBankQuestionImport(preview.valid);
        toast.success(
          `Created ${result.created}, skipped ${result.skipped}`,
        );
      }
      setPreview(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
    setBusy(false);
  };

  const downloadTemplate = async () => {
    const templates = await getCsvTemplates();
    const body =
      mode === "candidates" ? templates.candidates : templates.bankQuestions;
    const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      mode === "candidates" ? "candidates-template.csv" : (
        "bank-questions-template.csv"
      );
    a.click();
    URL.revokeObjectURL(url);
    toast.info("Template download started");
  };

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 rounded-xl border bg-card p-4">
      <div className="grid min-w-0 gap-2 sm:grid-cols-[auto_minmax(0,1fr)]">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => void downloadTemplate()}>
          Download CSV template
        </Button>
        <input
          type="file"
          aria-label="Choose a CSV or Excel file"
          className="min-h-11 w-full min-w-0 rounded-lg border border-input bg-background text-sm text-muted-foreground file:mr-2 file:min-h-11 file:cursor-pointer file:border-0 file:bg-secondary file:px-3 file:font-medium file:text-secondary-foreground focus-visible:outline-2"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          disabled={busy}
        />
      </div>
      {preview ?
        <div className="grid gap-2 text-sm">
          <p>
            Valid: <strong>{preview.validCount}</strong> · Invalid:{" "}
            <strong>{preview.invalid.length}</strong>
          </p>
          {preview.invalid.length > 0 ?
            <ul className="text-destructive max-h-40 overflow-y-auto text-xs">
              {preview.invalid.slice(0, 50).map((iss) => (
                <li key={`${iss.row}-${iss.message}`}>
                  Row {iss.row}: {iss.message}
                </li>
              ))}
            </ul>
          : null}
          <Button
            type="button"
            size="lg"
            disabled={busy || preview.validCount === 0}
            onClick={() => void commit()}>
            Import {preview.validCount} valid row(s)
          </Button>
        </div>
      : null}
    </div>
  );
};
