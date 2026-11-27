"use server";

import "server-only";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hashPasswordFunction } from "@/lib/argon2";
import prisma from "@/lib/database/dbClient";
import { requireRole } from "@/server/session";
import {
  BANK_QUESTION_CSV_HEADERS,
  bankQuestionImportRowSchema,
  CANDIDATE_CSV_HEADERS,
  candidateImportRowSchema,
} from "@/features/imports/schemas/csvSchemas";
import {
  assertFileLimits,
  MAX_BASE64_CHARS,
  parseCsvText,
  parseXlsxBuffer,
  type ParseResult,
} from "@/features/imports/services/parseTabular";
import {
  buildBankQuestionsExport,
  buildCandidatesExport,
  buildResultsExport,
} from "@/features/exports/services/exportBuilders";
import {
  buildQuestionGradingFields,
  parseMarkingScheme,
  splitLines,
} from "@/lib/exam/markingScheme";

const requireAdminOrExaminer = () => requireRole("admin", "examiner");
const requireAdmin = () => requireRole("admin");
const modeSchema = z.enum(["candidates", "bank_questions"]);
const requestSchema = z.object({
  mode: modeSchema,
  format: z.enum(["csv", "xlsx"]),
  body: z.string().min(1).max(MAX_BASE64_CHARS),
  encoding: z.enum(["text", "base64"]).default("text"),
  fileName: z.string().trim().min(1).max(255),
  commit: z.boolean(),
});

const parseFile = <T>(
  input: z.infer<typeof requestSchema>,
  schema: z.ZodType<T>,
  columns: readonly string[],
) => {
  if (input.format === "csv") {
    const text =
      input.encoding === "base64"
        ? Buffer.from(z.base64().parse(input.body), "base64").toString("utf8")
        : input.body;
    assertFileLimits(Buffer.byteLength(text), 0);
    return parseCsvText(text, schema, columns);
  }
  const buffer = Buffer.from(z.base64().parse(input.body), "base64");
  assertFileLimits(buffer.byteLength, 0);
  return parseXlsxBuffer(Uint8Array.from(buffer).buffer, schema, columns);
};

const inspectRows = <T>(
  parsed: ParseResult<T>,
  rowKey: (row: T) => string,
  existing: Set<string>,
  rowError: (row: T) => string | undefined = () => undefined,
) => {
  const invalid = [...parsed.invalid];
  const duplicates: number[] = [];
  const seen = new Set(existing);
  const accepted: T[] = [];
  const acceptedNumbers: number[] = [];
  parsed.valid.forEach((row, index) => {
    const number = parsed.validRowNumbers[index]!;
    const key = rowKey(row);
    const error = rowError(row);
    if (error) invalid.push({ row: number, message: error });
    else if (seen.has(key)) duplicates.push(number);
    else {
      seen.add(key);
      accepted.push(row);
      acceptedNumbers.push(number);
    }
  });
  invalid.sort((a, b) => a.row - b.row);
  return { accepted, acceptedNumbers, invalid, duplicates };
};

const recordFailure = async (
  kind: string,
  fileName: string,
  userId: string,
  rowCount: number,
  errorCount: number,
) => {
  await prisma.importJob.create({
    data: {
      kind,
      fileName,
      createdById: userId,
      rowCount,
      errorCount,
      status: "failed",
    },
  });
};

const questionKey = (row: {
  topicId: string;
  text: string;
  type: string;
  answer: string | null;
}) => JSON.stringify([row.topicId, row.text, row.type, row.answer ?? ""]);

export const runTabularImport = async (raw: unknown) => {
  const session = await requireAdminOrExaminer();
  const input = requestSchema.parse(raw);
  if (input.mode === "candidates" && session.user.role !== "admin")
    throw new Error("Only admins can import candidates");
  let rowCount = 0;
  try {
    if (input.mode === "candidates") {
      const parsed = parseFile(
        input,
        candidateImportRowSchema,
        CANDIDATE_CSV_HEADERS,
      );
      rowCount = parsed.rawCount;
      if (rowCount > 100)
        throw new Error("Candidate imports support up to 100 rows per file");
      const existing = await prisma.user.findMany({
        where: { email: { in: parsed.valid.map((row) => row.email) } },
        select: { email: true },
      });
      const { accepted, acceptedNumbers, invalid, duplicates } = inspectRows(
        parsed,
        (row) => row.email,
        new Set(existing.map((row) => row.email)),
      );
      const preview = accepted
        .slice(0, 10)
        .map((row, index) => ({
          row: acceptedNumbers[index]!,
          label: `${row.name} (${row.email})`,
        }));
      if (!input.commit)
        return {
          validCount: accepted.length,
          preview,
          invalid,
          duplicates,
          created: 0,
          skipped: duplicates.length,
          failed: invalid.length,
        };
      if (invalid.length) {
        await recordFailure(
          input.mode,
          input.fileName,
          session.user.id,
          rowCount,
          invalid.length,
        );
        return {
          validCount: accepted.length,
          preview: [],
          invalid,
          duplicates,
          created: 0,
          skipped: duplicates.length,
          failed: invalid.length,
        };
      }

      const prepared: {
        id: string;
        name: string;
        email: string;
        password: string;
      }[] = [];
      for (const row of accepted) {
        prepared.push({
          id: randomUUID(),
          name: row.name,
          email: row.email,
          password: await hashPasswordFunction(row.password),
        });
      }
      const created = await prisma.$transaction(async (tx) => {
        const users = await tx.user.createManyAndReturn({
          data: prepared.map(({ id, name, email }) => ({
            id,
            name,
            email,
            emailVerified: true,
            role: "student",
          })),
          skipDuplicates: true,
          select: { id: true },
        });
        const createdIds = new Set(users.map(({ id }) => id));
        await tx.account.createMany({
          data: prepared
            .filter(({ id }) => createdIds.has(id))
            .map(({ id, password }) => ({
              accountId: id,
              providerId: "credential",
              userId: id,
              password,
            })),
        });
        await tx.importJob.create({
          data: {
            kind: input.mode,
            fileName: input.fileName,
            rowCount,
            validCount: users.length,
            createdById: session.user.id,
            summary: `skippedDuplicates=${rowCount - users.length}`,
          },
        });
        return users.length;
      });
      revalidatePath("/admin/users");
      return {
        validCount: accepted.length,
        preview: [],
        invalid,
        duplicates,
        created,
        skipped: rowCount - created,
        failed: 0,
      };
    }

    const parsed = parseFile(
      input,
      bankQuestionImportRowSchema,
      BANK_QUESTION_CSV_HEADERS,
    );
    rowCount = parsed.rawCount;
    const normalized = {
      ...parsed,
      valid: parsed.valid.map((row) => ({
        ...row,
        options: splitLines(row.options).join("\n"),
        ...buildQuestionGradingFields({
          type: row.type,
          answer: row.answer,
          markingSchemeJson: row.markingScheme,
          manualGrading:
            parseMarkingScheme(row.markingScheme)?.mode === "manual",
        }),
      })),
    };
    const topicIds = [...new Set(normalized.valid.map((row) => row.topicId))];
    const run = async (
      db: Pick<typeof prisma, "topic" | "bankQuestion" | "importJob">,
    ) => {
      const [topics, existing] = await Promise.all([
        db.topic.findMany({
          where: { id: { in: topicIds } },
          select: { id: true },
        }),
        db.bankQuestion.findMany({
          where: {
            topicId: { in: topicIds },
            text: { in: [...new Set(normalized.valid.map((row) => row.text))] },
            ...(session.user.role === "examiner"
              ? { createdById: session.user.id }
              : {}),
          },
          select: { topicId: true, text: true, type: true, answer: true },
        }),
      ]);
      const known = new Set(topics.map(({ id }) => id));
      const { accepted, acceptedNumbers, invalid, duplicates } = inspectRows(
        normalized,
        questionKey,
        new Set(existing.map(questionKey)),
        (row) =>
          known.has(row.topicId) ? undefined : "topicId: Topic does not exist",
      );
      const preview = input.commit
        ? []
        : accepted
            .slice(0, 10)
            .map((row, index) => ({
              row: acceptedNumbers[index]!,
              label: row.text,
            }));
      let created = 0;
      if (input.commit) {
        if (!invalid.length) {
          const result = await db.bankQuestion.createMany({
            data: accepted.map(
              ({
                text,
                type,
                options,
                answer,
                points,
                difficulty,
                markingScheme,
                topicId,
              }) => ({
                text,
                type,
                options: options || null,
                answer,
                points,
                difficulty,
                markingScheme,
                topicId,
                createdById: session.user.id,
              }),
            ),
          });
          created = result.count;
        }
        await db.importJob.create({
          data: {
            kind: input.mode,
            fileName: input.fileName,
            rowCount,
            validCount: created,
            errorCount: invalid.length,
            createdById: session.user.id,
            status: invalid.length ? "failed" : "completed",
            summary: `skippedDuplicates=${duplicates.length}`,
          },
        });
      }
      return {
        validCount: accepted.length,
        preview,
        invalid,
        duplicates,
        created,
        skipped: duplicates.length,
        failed: invalid.length,
      };
    };
    if (!input.commit) return run(prisma);
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(75012)`;
        return run(tx);
      },
      { timeout: 15_000 },
    );
    revalidatePath("/admin/questions", "layout");
    revalidatePath("/examiner/questions", "layout");
    return result;
  } catch (error) {
    if (input.commit)
      await recordFailure(
        input.mode,
        input.fileName,
        session.user.id,
        rowCount,
        rowCount,
      ).catch(() => undefined);
    throw error;
  }
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
  z.string().min(1).max(64).parse(examId);
  z.enum(["csv", "xlsx"]).parse(format);
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
  const session = await requireAdminOrExaminer();
  return {
    candidates:
      session.user.role === "admin"
        ? "name,email,password,role\nJane Doe,jane@example.com,password123,student\n"
        : "",
    bankQuestions:
      'text,type,options,answer,points,difficulty,topicId,markingScheme\nWhat is 2+2?,single_choice,"3\n4\n5",4,1,easy,TOPIC_UUID,\n',
  };
};
