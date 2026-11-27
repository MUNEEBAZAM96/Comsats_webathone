"use client";

import { useEffect, useState } from "react";
import {
  downloadOwnResultReport,
  downloadQuestionPerformanceReport,
  publishCandidateResultReport,
  publishExamSummaryReport,
} from "@/server/reportActions";
import { Button, buttonVariants } from "@/components/shadcnui/button";

type ReportRequest =
  | { kind: "own"; attemptId: string }
  | { kind: "candidate"; attemptId: string }
  | { kind: "summary" | "questions"; examId: string };

export const ReportPdfControls = (props: ReportRequest) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [artifact, setArtifact] = useState<{
    href: string;
    name: string;
    verifyUrl?: string;
  } | null>(null);

  useEffect(
    () => () => {
      if (artifact) URL.revokeObjectURL(artifact.href);
    },
    [artifact],
  );

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const result: {
        pdfBase64: string;
        reportId?: string;
        verifyUrl?: string;
      } =
        props.kind === "own"
          ? await downloadOwnResultReport(props.attemptId)
          : props.kind === "candidate"
            ? await publishCandidateResultReport(props.attemptId)
            : props.kind === "summary"
              ? await publishExamSummaryReport(props.examId)
              : await downloadQuestionPerformanceReport(props.examId);
      const bytes = Uint8Array.from(atob(result.pdfBase64), (char) =>
        char.charCodeAt(0),
      );
      const href = URL.createObjectURL(
        new Blob([bytes], { type: "application/pdf" }),
      );
      setArtifact({
        href,
        name: result.reportId
          ? `report-${result.reportId}.pdf`
          : props.kind === "questions"
            ? "question-performance.pdf"
            : "candidate-result.pdf",
        verifyUrl: result.verifyUrl,
      });
    } catch {
      setError(
        "The PDF could not be prepared. Check your access and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid justify-items-start gap-3">
      <Button
        type="button"
        size="lg"
        variant="outline"
        disabled={busy}
        onClick={() => void run()}
      >
        {busy
          ? "Preparing PDF…"
          : props.kind === "own"
            ? "Prepare result PDF"
            : props.kind === "summary"
              ? "Publish examination summary PDF"
              : props.kind === "questions"
                ? "Prepare question performance PDF"
                : "Publish verifiable result PDF"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {artifact && (
        <div className="flex flex-wrap gap-2">
          <a
            className={buttonVariants({ variant: "outline" })}
            href={artifact.href}
            download={artifact.name}
          >
            Download PDF
          </a>
          <a
            className={buttonVariants({ variant: "outline" })}
            href={artifact.href}
            target="_blank"
            rel="noreferrer"
          >
            Open PDF to print
          </a>
          {artifact.verifyUrl && (
            <a
              className={buttonVariants({ variant: "outline" })}
              href={artifact.verifyUrl}
            >
              Verify report
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export const PublishResultReportButton = ({
  attemptId,
}: {
  attemptId: string;
}) => <ReportPdfControls kind="candidate" attemptId={attemptId} />;
