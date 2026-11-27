"use client";

import { useRef, useState } from "react";

export const PdfIntegrityCheck = ({
  expectedHash,
}: {
  expectedHash: string;
}) => {
  const [status, setStatus] = useState("");
  const revision = useRef(0);

  return (
    <div className="grid gap-2 rounded-xl border p-4 text-sm">
      <label className="grid gap-2">
        <span className="font-medium">Check a PDF for changes</span>
        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={async (event) => {
            const current = ++revision.current;
            const file = event.target.files?.[0];
            if (!file) {
              setStatus("");
              return;
            }
            if (file.size > 10 * 1024 * 1024) {
              setStatus("Choose a PDF smaller than 10 MB.");
              return;
            }
            setStatus("Checking PDF…");
            try {
              const digest = await crypto.subtle.digest(
                "SHA-256",
                await file.arrayBuffer(),
              );
              const hash = Array.from(new Uint8Array(digest), (byte) =>
                byte.toString(16).padStart(2, "0"),
              ).join("");
              if (current === revision.current)
                setStatus(
                  hash === expectedHash
                    ? "Integrity confirmed. This PDF matches the issued file."
                    : "Integrity check failed. This PDF differs from the issued file.",
                );
            } catch {
              if (current === revision.current)
                setStatus(
                  "File integrity could not be checked in this browser.",
                );
            }
          }}
        />
      </label>
      <p className="text-muted-foreground">
        Your browser checks the file locally.
      </p>
      <p role="status">{status}</p>
    </div>
  );
};
