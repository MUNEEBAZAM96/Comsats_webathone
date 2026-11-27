import * as XLSX from "xlsx";
import {
  sanitizeExportCell,
  toCsv,
} from "@/features/imports/services/parseTabular";
import { formatDisplayDateTime } from "@/lib/date/format";

export type ExportFile = {
  filename: string;
  mime: string;
  /** CSV text or base64-encoded XLSX */
  body: string;
  encoding: "utf8" | "base64";
};

const xlsxBase64 = (
  sheetName: string,
  headers: string[],
  rows: Record<string, unknown>[],
) => {
  const ws = XLSX.utils.json_to_sheet(
    rows.map((r) => {
      const out: Record<string, unknown> = {};
      for (const h of headers) out[h] = sanitizeExportCell(r[h] ?? "");
      return out;
    }),
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
};

export const buildCandidatesExport = (
  rows: { name: string; email: string; role: string; createdAt: Date }[],
  format: "csv" | "xlsx",
): ExportFile => {
  const headers = ["name", "email", "role", "createdAt"];
  const data = rows.map((r) => ({
    name: r.name,
    email: r.email,
    role: r.role,
    createdAt: formatDisplayDateTime(r.createdAt),
  }));
  if (format === "csv") {
    return {
      filename: "candidates.csv",
      mime: "text/csv;charset=utf-8",
      body: toCsv(headers, data),
      encoding: "utf8",
    };
  }
  return {
    filename: "candidates.xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    body: xlsxBase64("Candidates", headers, data),
    encoding: "base64",
  };
};

export const buildBankQuestionsExport = (
  rows: {
    text: string;
    type: string;
    options: string | null;
    answer: string | null;
    points: number;
    difficulty: string;
    topicName: string;
    subjectName: string;
  }[],
  format: "csv" | "xlsx",
): ExportFile => {
  const headers = [
    "subject",
    "topic",
    "text",
    "type",
    "options",
    "answer",
    "points",
    "difficulty",
  ];
  const data = rows.map((r) => ({
    subject: r.subjectName,
    topic: r.topicName,
    text: r.text,
    type: r.type,
    options: r.options ?? "",
    answer: r.answer ?? "",
    points: r.points,
    difficulty: r.difficulty,
  }));
  if (format === "csv") {
    return {
      filename: "question-bank.csv",
      mime: "text/csv;charset=utf-8",
      body: toCsv(headers, data),
      encoding: "utf8",
    };
  }
  return {
    filename: "question-bank.xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    body: xlsxBase64("Questions", headers, data),
    encoding: "base64",
  };
};

export const buildResultsExport = (
  examTitle: string,
  rows: {
    studentName: string;
    studentEmail: string;
    totalScore: number | null;
    maxScore: number;
    submittedAt: Date | null;
  }[],
  format: "csv" | "xlsx",
): ExportFile => {
  const headers = [
    "exam",
    "studentName",
    "studentEmail",
    "totalScore",
    "maxScore",
    "percentage",
    "submittedAt",
  ];
  const data = rows.map((r) => {
    const score = r.totalScore ?? 0;
    const pct =
      r.maxScore > 0 ? Math.round((score / r.maxScore) * 1000) / 10 : 0;
    return {
      exam: examTitle,
      studentName: r.studentName,
      studentEmail: r.studentEmail,
      totalScore: score,
      maxScore: r.maxScore,
      percentage: pct,
      submittedAt: r.submittedAt ? formatDisplayDateTime(r.submittedAt) : "",
    };
  });
  const safe = examTitle.replace(/[^\w\-]+/g, "_").slice(0, 40);
  if (format === "csv") {
    return {
      filename: `${safe}-results.csv`,
      mime: "text/csv;charset=utf-8",
      body: toCsv(headers, data),
      encoding: "utf8",
    };
  }
  return {
    filename: `${safe}-results.xlsx`,
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    body: xlsxBase64("Results", headers, data),
    encoding: "base64",
  };
};
