"use server";

import "server-only";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hashPasswordFunction } from "@/lib/argon2";
import { auth } from "@/lib/auth";
import prisma from "@/lib/database/dbClient";
import {
  BANK_QUESTION_CSV_HEADERS,
  bankQuestionImportRowSchema,
  CANDIDATE_CSV_HEADERS,
  candidateImportRowSchema,
  type BankQuestionImportRow,
  type CandidateImportRow,
} from "@/features/imports/schemas/csvSchemas";
import {
  assertBase64Limits,
  assertFileLimits,
  MAX_ROWS,
  parseCsvText,
  parseXlsxBuffer,
} from "@/features/imports/services/parseTabular";
import {
  buildBankQuestionsExport,
  buildCandidatesExport,
  buildResultsExport,
} from "@/features/exports/services/exportBuilders";
import { buildQuestionGradingFields } from "@/lib/exam/markingScheme";

const requireAdminOrExaminer = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  if (session.user.role !== "admin" && session.user.role !== "examiner")
    redirect("/");
  return session;
};

const requireAdmin = async () => {
  const session = await requireAdminOrExaminer();
  if (session.user.role !== "admin")
    throw new Error("Only admins can import candidates");
  return session;
};

const decodeXlsxBase64 = (base64: string) => {
  assertBase64Limits(base64);
  const binary = Buffer.from(base64, "base64");
  assertFileLimits(binary.byteLength, MAX_ROWS);
  return binary;
};

const revalidateCandidateRows = (rows: unknown[]): CandidateImportRow[] => {
  if (!Array.isArray(rows)) throw new Error("Invalid import payload");
  if (rows.length === 0) throw new Error("No valid rows to import");
  if (rows.length > MAX_ROWS)
    throw new Error(`Too many rows (max ${MAX_ROWS})`);

  const valid: CandidateImportRow[] = [];
  const errors: string[] = [];
  rows.forEach((row, i) => {
    const parsed = candidateImportRowSchema.safeParse(row);
    if (parsed.success) valid.push(parsed.data);
    else {
      errors.push(
        `row ${i + 1}: ${parsed.error.issues.map((iss) => iss.message).join("; ")}`,
      );
    }
  });
  if (errors.length > 0)
    throw new Error(`Import rejected — invalid rows: ${errors.slice(0, 5).join(" | ")}`);
  return valid;
};

const revalidateBankRows = (rows: unknown[]): BankQuestionImportRow[] => {
  if (!Array.isArray(rows)) throw new Error("Invalid import payload");
  if (rows.length === 0) throw new Error("No valid rows to import");
  if (rows.length > MAX_ROWS)
    throw new Error(`Too many rows (max ${MAX_ROWS})`);

  const valid: BankQuestionImportRow[] = [];
  const errors: string[] = [];
  rows.forEach((row, i) => {
    const parsed = bankQuestionImportRowSchema.safeParse(row);
    if (parsed.success) valid.push(parsed.data);
    else {
      errors.push(
        `row ${i + 1}: ${parsed.error.issues.map((iss) => iss.message).join("; ")}`,
      );
    }
  });
  if (errors.length > 0)
    throw new Error(`Import rejected — invalid rows: ${errors.slice(0, 5).join(" | ")}`);
  return valid;
};

export const previewCandidateCsv = async (csvText: string) => {
  await requireAdmin();
  return parseCsvText(csvText, candidateImportRowSchema, CANDIDATE_CSV_HEADERS);
};

export const previewCandidateXlsx = async (base64: string) => {
  await requireAdmin();
  const binary = decodeXlsxBase64(base64);
  return parseXlsxBuffer(
    binary.buffer.slice(
      binary.byteOffset,
      binary.byteOffset + binary.byteLength,
    ),
    candidateImportRowSchema,
    CANDIDATE_CSV_HEADERS,
  );
};

export const commitCandidateImport = async (
  rows: unknown[],
  fileName?: string,
) => {
  const session = await requireAdmin();
  const validRows = revalidateCandidateRows(rows);

  const uniqueRows = [
    ...new Map(validRows.map((row) => [row.email, row])).values(),
  ];
  const existing = await prisma.user.findMany({
    where: { email: { in: uniqueRows.map((row) => row.email) } },
    select: { email: true },
  });
  const existingEmails = new Set(existing.map((u) => u.email));
  const toCreate = uniqueRows.filter((row) => !existingEmails.has(row.email));

  // Argon2 is slow by design; hash before opening the transaction so a large
  // file cannot exceed the interactive transaction timeout.
  const prepared: Array<CandidateImportRow & { id: string; hashed: string }> =
    [];
  for (const row of toCreate) {
    prepared.push({
      ...row,
      id: randomUUID(),
      hashed: await hashPasswordFunction(row.password),
    });
  }

  const created = prepared.length;
  const skipped = validRows.length - created;

  await prisma.$transaction(async (tx) => {
    await tx.user.createMany({
      data: prepared.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        emailVerified: true,
        role: "student",
      })),
    });
    await tx.account.createMany({
      data: prepared.map((row) => ({
        accountId: row.id,
        providerId: "credential",
        userId: row.id,
        password: row.hashed,
      })),
    });

    await tx.importJob.create({
      data: {
        kind: "candidates",
        fileName: fileName ?? null,
        rowCount: validRows.length,
        validCount: created,
        errorCount: skipped,
        createdById: session.user.id,
        summary: `created=${created}; skippedDuplicates=${skipped}`,
      },
    });
  });

  return { created, skipped, errors: [] as string[] };
};

export const previewBankQuestionCsv = async (csvText: string) => {
  await requireAdminOrExaminer();
  return parseCsvText(
    csvText,
    bankQuestionImportRowSchema,
    BANK_QUESTION_CSV_HEADERS,
  );
};

export const previewBankQuestionXlsx = async (base64: string) => {
  await requireAdminOrExaminer();
  const binary = decodeXlsxBase64(base64);
  return parseXlsxBuffer(
    binary.buffer.slice(
      binary.byteOffset,
      binary.byteOffset + binary.byteLength,
    ),
    bankQuestionImportRowSchema,
    BANK_QUESTION_CSV_HEADERS,
  );
};

export const commitBankQuestionImport = async (
  rows: unknown[],
  fileName?: string,
) => {
  const session = await requireAdminOrExaminer();
  const validRows = revalidateBankRows(rows);

  let created = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of validRows) {
      const topic = await tx.topic.findUnique({ where: { id: row.topicId } });
      if (!topic) {
        skipped++;
        continue;
      }
      const dup = await tx.bankQuestion.findFirst({
        where: {
          topicId: row.topicId,
          text: row.text,
          type: row.type,
          answer: row.answer,
        },
      });
      if (dup) {
        skipped++;
        continue;
      }
      const grading = buildQuestionGradingFields({
        type: row.type,
        answer: row.answer,
      });
      await tx.bankQuestion.create({
        data: {
          text: row.text,
          type: row.type,
          options: row.options || null,
          answer: grading.answer,
          points: row.points,
          difficulty: row.difficulty ?? "medium",
          markingScheme: grading.markingScheme,
          topicId: row.topicId,
          createdById: session.user.id,
        },
      });
      created++;
    }

    await tx.importJob.create({
      data: {
        kind: "bank_questions",
        fileName: fileName ?? null,
        rowCount: validRows.length,
        validCount: created,
        errorCount: skipped,
        createdById: session.user.id,
        summary: `created=${created}; skipped=${skipped}`,
      },
    });
  });

  return { created, skipped };
};

export const exportCandidatesAction = async (format: "csv" | "xlsx") => {
  await requireAdmin();
  const users = await prisma.user.findMany({
    where: { role: "student" },
    orderBy: { createdAt: "desc" },
    select: { name: true, email: true, role: true, createdAt: true },
  });
  return buildCandidatesExport(users, format);
};

export const exportBankQuestionsAction = async (format: "csv" | "xlsx") => {
  await requireAdminOrExaminer();
  const questions = await prisma.bankQuestion.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      topic: { include: { subject: { select: { name: true } } } },
    },
  });
  return buildBankQuestionsExport(
    questions.map((q) => ({
      text: q.text,
      type: q.type,
      options: q.options,
      answer: q.answer,
      points: q.points,
      difficulty: q.difficulty,
      topicName: q.topic.name,
      subjectName: q.topic.subject.name,
    })),
    format,
  );
};

export const exportExamResultsAction = async (
  examId: string,
  format: "csv" | "xlsx",
) => {
  const session = await requireAdminOrExaminer();
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, title: true, createdById: true },
  });
  if (!exam) throw new Error("Exam not found");
  if (session.user.role !== "admin" && exam.createdById !== session.user.id)
    throw new Error("Not authorized to export this exam");

  const attempts = await prisma.examAttempt.findMany({
    where: { examId, status: { not: "in_progress" } },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { submittedAt: "desc" },
  });

  await prisma.importJob.create({
    data: {
      kind: "exam_results_export",
      rowCount: attempts.length,
      validCount: attempts.length,
      createdById: session.user.id,
      summary: `examId=${examId}; format=${format}`,
    },
  });

  return buildResultsExport(
    exam.title,
    attempts.map((a) => ({
      studentName: a.user.name,
      studentEmail: a.user.email,
      status: a.status,
      autoScore: a.autoScore,
      manualScore: a.manualScore,
      totalScore: a.totalScore,
      maxScore: a.maxScore,
      submittedAt: a.submittedAt,
      gradedAt: a.gradedAt,
      submitSource: a.submitSource,
    })),
    format,
  );
};

export const getCsvTemplates = async () => {
  await requireAdminOrExaminer();
  return {
    candidates: "name,email,password\nJane Doe,jane@example.com,password123\n",
    bankQuestions:
      "text,type,options,answer,points,difficulty,topicId\nWhat is 2+2?,single_choice,\"3\\n4\\n5\",4,1,easy,TOPIC_UUID\n",
  };
};
