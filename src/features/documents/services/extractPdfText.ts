"use client";

const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_PDF_PAGES = 50;
const MAX_EXTRACTED_CHARS = 200_000;

export type PdfExtractResult =
  | { ok: true; text: string; pageCount: number }
  | { ok: false; error: string };

/**
 * Client-side PDF text extraction for examiner preview only.
 * Never auto-publishes as exam questions.
 */
export const extractPdfText = async (file: File): Promise<PdfExtractResult> => {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))
    return { ok: false, error: "Only PDF files are supported" };
  if (file.size > MAX_PDF_BYTES)
    return { ok: false, error: "PDF exceeds 5MB limit" };

  try {
    const pdfjs = await import("pdfjs-dist");
    // CDN worker matched to installed package version (bundler-safe).
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;
    if (doc.numPages > MAX_PDF_PAGES) {
      return {
        ok: false,
        error: `PDF exceeds ${MAX_PDF_PAGES} page limit`,
      };
    }
    const parts: string[] = [];
    let totalChars = 0;

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const line = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      totalChars += line.length;
      if (totalChars > MAX_EXTRACTED_CHARS) {
        return {
          ok: false,
          error: "Extracted text exceeds size limit",
        };
      }
      parts.push(line);
    }

    const text = parts.join("\n\n").trim();
    if (!text) {
      return {
        ok: false,
        error:
          "No extractable text found. This may be a scanned PDF — OCR is not available.",
      };
    }

    return { ok: true, text, pageCount: doc.numPages };
  } catch {
    return {
      ok: false,
      error: "Unable to parse this PDF. The file may be corrupted or unsupported.",
    };
  }
};
