"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  getCsvTemplates,
  runTabularImport,
} from "@/server/importExportActions";
import { Button } from "@/components/shadcnui/button";

type Mode = "candidates" | "bank_questions";
type ImportResult = Awaited<ReturnType<typeof runTabularImport>>;

const readFile = async (file: File) => {
  if (file.size > 2 * 1024 * 1024)
    throw new Error("The file exceeds the 2 MB limit");
  const format = /\.csv$/i.test(file.name)
    ? "csv"
    : /\.xlsx$/i.test(file.name)
      ? "xlsx"
      : null;
  if (!format) throw new Error("Choose a CSV or XLSX file");
  const buf = new Uint8Array(await file.arrayBuffer());
  const chunks: string[] = [];
  for (let offset = 0; offset < buf.length; offset += 8192) {
    chunks.push(String.fromCharCode(...buf.subarray(offset, offset + 8192)));
  }
  return {
    body: btoa(chunks.join("")),
    fileName: file.name,
    format,
    encoding: "base64" as const,
  };
};

export const TabularImportPanel = ({ mode }: { mode: Mode }) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (selection: File, commit: boolean) => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const next = await runTabularImport({
        ...(await readFile(selection)),
        mode,
        commit,
      });
      setPreview(commit ? null : next);
      if (commit) setResult(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import request failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const templates = await getCsvTemplates();
      const body =
        mode === "candidates" ? templates.candidates : templates.bankQuestions;
      const url = URL.createObjectURL(
        new Blob([body], { type: "text/csv;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download =
        mode === "candidates"
          ? "candidates-template.csv"
          : "bank-questions-template.csv";
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error("The import template could not be downloaded");
    }
  };

  const details = result ?? preview;
  return (
    <section
      aria-label={
        mode === "candidates" ? "Bulk candidate import" : "Bulk question import"
      }
      className="grid min-w-0 gap-4 rounded-xl border bg-card p-4"
    >
      <h2 className="font-medium">
        {mode === "candidates" ? "Import candidates" : "Import questions"}
      </h2>
      <div className="grid min-w-0 gap-2 sm:grid-cols-[auto_minmax(0,1fr)]">
        <Button
          variant="outline"
          size="lg"
          onClick={() => void downloadTemplate()}
        >
          Download CSV template
        </Button>
        <input
          type="file"
          aria-label="Choose a CSV or Excel file"
          accept=".csv,.xlsx"
          disabled={busy}
          className="min-h-11 min-w-0 rounded-lg border bg-background text-sm file:mr-2 file:min-h-11 file:border-0 file:bg-secondary file:px-3"
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            setFile(next);
            setPreview(null);
            setResult(null);
            setError("");
            if (next) void run(next, false);
          }}
        />
      </div>
      {mode === "bank_questions" && (
        <p className="text-muted-foreground text-sm">
          Replace the sample topic identifier with the identifier from the topic
          page URL. Each question is added to your question bank.
        </p>
      )}
      {busy && <p role="status">Processing file…</p>}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {details && (
        <div className="grid justify-items-start gap-2 text-sm">
          <p role="status">
            {result
              ? `Created ${result.created}, skipped ${result.skipped}, failed ${result.failed}.`
              : `${details.validCount} ready to import, ${details.skipped} duplicates, ${details.failed} invalid.`}
          </p>
          {details.preview.length > 0 && (
            <ul className="list-disc pl-5" aria-label="First valid rows">
              {details.preview.map(({ row, label }) => (
                <li key={row} className="break-words">
                  Row {row}: {label}
                </li>
              ))}
            </ul>
          )}
          {details.duplicates.length > 0 && (
            <p className="break-all">
              Duplicate rows {details.duplicates.join(", ")}
            </p>
          )}
          {details.invalid.length > 0 && (
            <ul
              className="text-destructive max-h-48 list-disc overflow-y-auto pl-5"
              aria-label="Invalid rows"
            >
              {details.invalid.map(({ row, message }) => (
                <li key={row}>
                  Row {row}: {message}
                </li>
              ))}
            </ul>
          )}
          {preview && (
            <Button
              disabled={busy || preview.failed > 0 || !preview.validCount}
              onClick={() => {
                if (file) void run(file, true);
              }}
            >
              Import {preview.validCount} rows
            </Button>
          )}
        </div>
      )}
    </section>
  );
};
