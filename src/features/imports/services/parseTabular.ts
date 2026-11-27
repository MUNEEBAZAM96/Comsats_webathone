import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { ZodType } from "zod";

export type RowIssue = { row: number; message: string };

export type ParseResult<T> = {
  valid: T[];
  invalid: RowIssue[];
  headers: string[];
  rawCount: number;
};

export const MAX_ROWS = 2000;
export const MAX_BYTES = 2 * 1024 * 1024;
/** Reject base64 payloads larger than ~2.8× decoded max before Buffer.from. */
export const MAX_BASE64_CHARS = Math.ceil(MAX_BYTES * 1.4) + 64;

export const assertFileLimits = (bytes: number, rowCount: number) => {
  if (bytes > MAX_BYTES) throw new Error("File exceeds 2MB limit");
  if (rowCount > MAX_ROWS) throw new Error(`Too many rows (max ${MAX_ROWS})`);
};

export const assertBase64Limits = (base64: string) => {
  if (base64.length > MAX_BASE64_CHARS)
    throw new Error("File exceeds 2MB limit");
};

/** Neutralize CSV/Excel formula injection on exported cell values. */
export const sanitizeExportCell = (value: unknown): string | number | boolean => {
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) return `'${text}`;
  return text;
};

export const parseCsvText = <T>(
  text: string,
  schema: ZodType<T>,
  requiredHeaders: readonly string[],
): ParseResult<T> => {
  if (!text.trim()) throw new Error("Empty file");

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new Error(
      first?.message ?? "Malformed CSV — check quoting and headers",
    );
  }

  const headers = parsed.meta.fields ?? [];
  for (const h of requiredHeaders) {
    if (!headers.includes(h.toLowerCase()))
      throw new Error(`Missing required column: ${h}`);
  }

  assertFileLimits(new TextEncoder().encode(text).length, parsed.data.length);

  const valid: T[] = [];
  const invalid: RowIssue[] = [];

  parsed.data.forEach((row, i) => {
    const result = schema.safeParse(row);
    if (result.success) valid.push(result.data);
    else {
      invalid.push({
        row: i + 2,
        message: result.error.issues
          .map((iss) => `${iss.path.join(".")}: ${iss.message}`)
          .join("; "),
      });
    }
  });

  return { valid, invalid, headers, rawCount: parsed.data.length };
};

export const parseXlsxBuffer = <T>(
  buffer: ArrayBuffer,
  schema: ZodType<T>,
  requiredHeaders: readonly string[],
  sheetName?: string,
): ParseResult<T> => {
  assertFileLimits(buffer.byteLength, MAX_ROWS);

  const workbook = XLSX.read(buffer, {
    type: "array",
    cellFormula: false,
    cellHTML: false,
    raw: false,
  });

  const name = sheetName ?? workbook.SheetNames[0];
  if (!name || !workbook.Sheets[name])
    throw new Error("Worksheet not found in spreadsheet");

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[name]!,
    { defval: "", raw: false },
  );

  assertFileLimits(buffer.byteLength, rows.length);

  if (rows.length === 0) throw new Error("Empty worksheet");

  const headers = Object.keys(rows[0] ?? {}).map((h) => h.trim().toLowerCase());
  for (const h of requiredHeaders) {
    if (!headers.includes(h.toLowerCase()))
      throw new Error(`Missing required column: ${h}`);
  }

  const valid: T[] = [];
  const invalid: RowIssue[] = [];

  rows.forEach((row, i) => {
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      normalized[k.trim().toLowerCase()] = typeof v === "string" ? v : String(v);
    }
    const result = schema.safeParse(normalized);
    if (result.success) valid.push(result.data);
    else {
      invalid.push({
        row: i + 2,
        message: result.error.issues
          .map((iss) => `${iss.path.join(".")}: ${iss.message}`)
          .join("; "),
      });
    }
  });

  return { valid, invalid, headers, rawCount: rows.length };
};

export const toCsv = (headers: string[], rows: Record<string, unknown>[]) =>
  Papa.unparse({
    fields: headers,
    data: rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const h of headers) out[h] = sanitizeExportCell(row[h]);
      return out;
    }),
  });

