"use client";

import { useState } from "react";
import { toast } from "sonner";
import { publishCandidateResultReport } from "@/server/reportActions";
import { Button } from "@/components/shadcnui/button";

export const PublishResultReportButton = ({
  attemptId,
}: {
  attemptId: string;
}) => {
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    try {
      const result = await publishCandidateResultReport(attemptId);
      setQr(result.qrDataUrl);
      setUrl(result.verifyUrl);
      const bin = atob(result.pdfBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `result-${result.reportId}.pdf`;
      a.click();
      URL.revokeObjectURL(href);
      toast.success("Report published and PDF downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to publish report");
    }
    setBusy(false);
  };

  return (
    <div className="grid gap-3">
      <Button
        type="button"
        size="lg"
        variant="outline"
        disabled={busy}
        onClick={() => void run()}>
        {busy ? "Publishing…" : "Publish PDF + verification QR"}
      </Button>
      {url ?
        <p className="text-muted-foreground break-all text-xs">
          Verify: {url}
        </p>
      : null}
      {qr ?
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qr}
          alt="Verification QR code"
          className="size-40"
        />
      : null}
    </div>
  );
};
