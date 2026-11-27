"use client";

import { useState } from "react";
import { toast } from "sonner";
import { downloadExportFile } from "@/features/exports/components/downloadExport";
import { exportExamResultsAction } from "@/server/importExportActions";
import { Button } from "@/components/shadcnui/button";

export const ExportResultsButtons = ({ examId }: { examId: string }) => {
  const [busy, setBusy] = useState(false);

  const download = async (format: "csv" | "xlsx") => {
    setBusy(true);
    try {
      const file = await exportExamResultsAction(examId, format);
      downloadExportFile(file);
      toast.success(`Downloaded ${file.filename}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={busy}
        onClick={() => void download("csv")}>
        Export CSV
      </Button>
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={busy}
        onClick={() => void download("xlsx")}>
        Export Excel
      </Button>
    </div>
  );
};
