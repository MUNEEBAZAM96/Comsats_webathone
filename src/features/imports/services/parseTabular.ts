import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { ZodType } from "zod";

export type RowIssue = { row: number; message: string };

export type ParseResult<T> = {
  valid: T[];
  validRowNumbers: number[];
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
export const sanitizeExportCell = (
  value: unknown,
): string | number | boolean => {
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

  const fileError = parsed.errors.find(
    (error) => error.type !== "FieldMismatch" || error.row === undefined,
  );
  if (fileError) {
    const first = fileError;
    throw new Error(
      first?.message ?? "Malformed CSV — check quoting and headers",
    );
  }

  const headers = parsed.meta.fields ?? [];
  if (Object.keys(parsed.meta.renamedHeaders ?? {}).length)
    throw new Error("Duplicate column headings");
  for (const h of requiredHeaders) {
    if (!headers.includes(h.toLowerCase()))
      throw new Error(`Missing required column: ${h}`);
  }

  assertFileLimits(new TextEncoder().encode(text).length, parsed.data.length);

  const valid: T[] = [];
  const invalid: RowIssue[] = [];
  const validRowNumbers: number[] = [];

  const malformed = new Map(
    parsed.errors.map((error) => [error.row, error.message]),
  );
  parsed.data.forEach((row, i) => {
    const fieldsError = malformed.get(i);
    if (fieldsError) {
      invalid.push({ row: i + 2, message: fieldsError });
      return;
    }
    const result = schema.safeParse(row);
    if (result.success) {
      valid.push(result.data);
      validRowNumbers.push(i + 2);
    } else {
      invalid.push({
        row: i + 2,
        message: result.error.issues
          .map((iss) => `${iss.path.join(".")}: ${iss.message}`)
          .join("; "),
      });
    }
  });

  return {
    valid,
    validRowNumbers,
    invalid,
    headers,
    rawCount: parsed.data.length,
  };
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
    sheetRows: MAX_ROWS + 2,
    sheets: sheetName ?? 0,
  });

  const name = sheetName ?? workbook.SheetNames[0];
  if (!name || !workbook.Sheets[name])
    throw new Error("Worksheet not found in spreadsheet");

  const sheet = workbook.Sheets[name]!;
  const fullRange = sheet["!fullref"] ?? sheet["!ref"];
  if (!fullRange) throw new Error("Empty worksheet");
  const range = XLSX.utils.decode_range(fullRange);
  assertFileLimits(buffer.byteLength, range.e.r - range.s.r);
  if (range.e.c - range.s.c >= 64)
    throw new Error("The worksheet exceeds 64 columns");

  const headerRange = { s: range.s, e: { ...range.e, r: range.s.r } };
  const [header = []] = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    range: headerRange,
  });
  const headers = header
    .map((value) =>
      String(value ?? "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  if (new Set(headers).size !== headers.length)
    throw new Error("Duplicate column headings");

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  if (rows.length === 0) throw new Error("Empty worksheet");
  for (const h of requiredHeaders) {
    if (!headers.includes(h.toLowerCase()))
      throw new Error(`Missing required column: ${h}`);
  }

  const valid: T[] = [];
  const invalid: RowIssue[] = [];
  const validRowNumbers: number[] = [];

  rows.forEach((row, i) => {
    const rowNumber =
      typeof row.__rowNum__ === "number" ? row.__rowNum__ + 1 : i + 2;
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      normalized[k.trim().toLowerCase()] =
        typeof v === "string" ? v : String(v);
    }
    const result = schema.safeParse(normalized);
    if (result.success) {
      valid.push(result.data);
      validRowNumbers.push(rowNumber);
    } else {
      invalid.push({
        row: rowNumber,
        message: result.error.issues
          .map((iss) => `${iss.path.join(".")}: ${iss.message}`)
          .join("; "),
      });
    }
  });

  return { valid, validRowNumbers, invalid, headers, rawCount: rows.length };
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
