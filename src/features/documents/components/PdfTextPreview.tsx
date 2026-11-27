"use client";

import { useState } from "react";
import { extractPdfText } from "@/features/documents/services/extractPdfText";
import { Button } from "@/components/shadcnui/button";

export const PdfTextPreview = () => {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pages, setPages] = useState<number | null>(null);

  const onFile = async (file: File | null) => {
    if (!file) return;
    setLoading(true);
    setError("");
    setText("");
    setPages(null);
    const result = await extractPdfText(file);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setText(result.text);
    setPages(result.pageCount);
  };

  return (
    <div className="border-border grid gap-3 rounded-lg border p-4">
      <div className="grid gap-1">
        <h3 className="text-sm font-medium">PDF source preview</h3>
        <p className="text-muted-foreground text-xs">
          Extract text for question preparation. Nothing is published
          automatically.
        </p>
      </div>
      <input
        type="file"
        accept="application/pdf,.pdf"
        onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
      />
      {loading ?
        <p className="text-muted-foreground text-sm">Extracting…</p>
      : null}
      {error ?
        <p className="text-destructive text-sm">{error}</p>
      : null}
      {pages != null ?
        <p className="text-muted-foreground text-xs">{pages} page(s)</p>
      : null}
      {text ?
        <textarea
          readOnly
          value={text}
          className="bg-muted/30 h-48 w-full resize-y rounded-md p-3 text-sm"
        />
      : null}
      {text ?
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => {
            void navigator.clipboard.writeText(text);
          }}>
          Copy extracted text
        </Button>
      : null}
    </div>
  );
};
