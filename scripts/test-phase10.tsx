import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createElement } from "react";
import * as XLSX from "xlsx";
import {
  bankQuestionImportRowSchema,
  BANK_QUESTION_CSV_HEADERS,
  candidateImportRowSchema,
  CANDIDATE_CSV_HEADERS,
} from "../src/features/imports/schemas/csvSchemas";
import {
  parseCsvText,
  parseXlsxBuffer,
} from "../src/features/imports/services/parseTabular";
import { CandidateResultDocument } from "../src/features/reports/templates/CandidateResultPdf";
import { renderPdfToBuffer } from "../src/features/reports/services/renderPdf";
import { generateVerificationQrDataUrl } from "../src/features/verification/services/qr";
import {
  hashReportPayload,
  publicMetaFromCandidate,
  type CanonicalCandidateReport,
} from "../src/features/verification/services/reportHash";

const csv =
  'text,type,options,answer,points,difficulty,TopicId\nValid,single_choice,"A\nB",A,2,easy,topic-id\nInvalid,single_choice,"A\nB",C,2,easy,topic-id\n';
const result = parseCsvText(
  csv,
  bankQuestionImportRowSchema,
  BANK_QUESTION_CSV_HEADERS,
);
assert.equal(result.valid[0]?.topicId, "topic-id");
assert.deepEqual(result.validRowNumbers, [2]);
assert.equal(result.invalid[0]?.row, 3);
assert.match(result.invalid[0]?.message ?? "", /^answer:/);
assert.equal(
  bankQuestionImportRowSchema.safeParse({ ...result.valid[0], points: "" })
    .success,
  false,
);
assert.equal(
  bankQuestionImportRowSchema.safeParse({
    ...result.valid[0],
    markingscheme: '{ "version": 1, "mode": "manual" }',
  }).success,
  false,
);
assert.equal(
  bankQuestionImportRowSchema.safeParse({
    text: "Written",
    type: "short_answer",
    points: 1,
    topicId: "t",
  }).success,
  false,
);

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  workbook,
  XLSX.utils.aoa_to_sheet([
    ["Name", "Email", "Password", "Role"],
    ["Test Student", " Candidate@Example.com ", "test-password", "student"],
    ["Invalid Role", "bad@example.com", "test-password", "admin"],
  ]),
  "Candidates",
);
const bytes = XLSX.write(workbook, {
  bookType: "xlsx",
  type: "array",
}) as ArrayBuffer;
const candidates = parseXlsxBuffer(
  bytes,
  candidateImportRowSchema,
  CANDIDATE_CSV_HEADERS,
);
assert.equal(candidates.valid[0]?.email, "candidate@example.com");
assert.equal(candidates.invalid[0]?.row, 3);

const payload: CanonicalCandidateReport = {
  type: "candidate_result",
  examId: "internal-exam",
  attemptId: "internal-attempt",
  examTitle: "Sample examination",
  totalScore: 8,
  maxScore: 10,
  submittedAt: null,
};
const date = new Date("2026-11-27T00:00:00Z");
assert.equal(hashReportPayload(payload), hashReportPayload({ ...payload }));
assert.notEqual(
  hashReportPayload(payload),
  hashReportPayload({ ...payload, totalScore: 9 }),
);
assert.doesNotMatch(publicMetaFromCandidate(payload, date), /internal-/);
const id = "6bd70ee3-19c3-4b6f-a27a-e0fb65b6774a";
const url = `https://example.com/verify/${id}`;
const qr = await generateVerificationQrDataUrl(url);
const render = (
  title: string,
  rows: { label: string; value: string }[],
  sections: { title: string; rows: { label: string; value: string }[] }[] = [],
) =>
  renderPdfToBuffer(
    createElement(CandidateResultDocument, {
      title,
      examTitle: payload.examTitle,
      date,
      rows,
      sections,
      verification: { id, url, qr },
    }),
  );
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const rows = [
  { label: "Candidate", value: "Test Student" },
  { label: "Score", value: "8 / 10 (80%)" },
];
const sections = [
  { title: "Question marks", rows: [{ label: "Question 1", value: "8 / 10" }] },
];
const original = await render("Candidate result report", rows, sections);
assert.equal(original.subarray(0, 5).toString(), "%PDF-");
assert.equal(
  hash(original),
  hash(await render("Candidate result report", rows, sections)),
);
assert.notEqual(
  hash(original),
  hash(Buffer.concat([original, Buffer.from("modified")])),
);
const summary = await render("Examination summary report", [
  { label: "Graded attempts", value: "12" },
  { label: "Average score", value: "8 / 10 (80%)" },
]);
assert.equal(summary.subarray(0, 5).toString(), "%PDF-");
if (process.env.PHASE10_PDF_SAMPLE_DIR) {
  await writeFile(
    join(process.env.PHASE10_PDF_SAMPLE_DIR, "candidate-phase10.pdf"),
    original,
  );
  await writeFile(
    join(process.env.PHASE10_PDF_SAMPLE_DIR, "summary-phase10.pdf"),
    summary,
  );
}
console.log("Phase 10 CSV/XLSX validation and PDF integrity checks passed.");
