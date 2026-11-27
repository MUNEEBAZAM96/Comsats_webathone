"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/database/dbClient";
import { refreshExamTotalMarks } from "@/lib/exam/lifecycle";
import { buildQuestionGradingFields } from "@/lib/exam/markingScheme";
import {
  bankQuestionFormSchema,
  randomImportSchema,
} from "@/lib/zodSchema";
import { Prisma } from "@generated/prisma/client";

const requireExaminer = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  if (session.user.role !== "admin" && session.user.role !== "examiner")
    redirect("/");
  return session;
};

const basePathFor = (role?: string | null) =>
  role === "admin" ? "/admin" : "/examiner";

const revalidateBank = (role?: string | null, ...extraPaths: string[]) => {
  const base = basePathFor(role);
  revalidatePath(`${base}/questions`);
  for (const path of extraPaths) {
    revalidatePath(path);
  }
  if (role === "admin") {
    revalidateTag("admin-dashboard", "max");
  } else {
    revalidateTag("examiner-dashboard", "max");
  }
};

// ── Subjects ──────────────────────────────────────────────────────────────

export const getSubjects = async () => {
  await requireExaminer();

  try {
    return await prisma.subject.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { topics: true } },
        topics: {
          select: {
            _count: { select: { questions: true } },
          },
        },
      },
    });
  } catch {
    throw new Error("Failed to fetch subjects");
  }
};

export const getSubjectById = async (id: string) => {
  const session = await requireExaminer();

  try {
    const subject = await prisma.subject.findUnique({
      where: { id },
      include: {
        topics: {
          orderBy: [{ order: "asc" }, { name: "asc" }],
          include: {
            _count: { select: { questions: true } },
          },
        },
      },
    });
    if (!subject) redirect(`${basePathFor(session.user.role)}/questions`);
    return subject;
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    throw new Error("Failed to fetch subject");
  }
};

export const createSubject = async (formData: FormData) => {
  const session = await requireExaminer();

  try {
    const name = (formData.get("name") as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || null;

    if (!name) throw new Error("Subject name is required");
    if (name.length > 100) throw new Error("Subject name is too long");

    await prisma.subject.create({
      data: {
        name,
        description,
      },
    });

    revalidateBank(session.user.role);
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    )
      throw new Error("A subject with this name already exists");
    if (e instanceof Error) throw e;
    throw new Error("Failed to create subject");
  }
};

export const updateSubject = async (id: string, formData: FormData) => {
  const session = await requireExaminer();

  try {
    const existing = await prisma.subject.findUnique({ where: { id } });
    if (!existing) throw new Error("Subject not found");

    const name = (formData.get("name") as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || null;

    if (!name) throw new Error("Subject name is required");
    if (name.length > 100) throw new Error("Subject name is too long");

    await prisma.subject.update({
      where: { id },
      data: { name, description },
    });

    revalidateBank(
      session.user.role,
      `${basePathFor(session.user.role)}/questions/subjects/${id}`,
    );
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    )
      throw new Error("A subject with this name already exists");
    if (e instanceof Error) throw e;
    throw new Error("Failed to update subject");
  }
};

export const deleteSubject = async (id: string) => {
  const session = await requireExaminer();
  if (session.user.role !== "admin")
    throw new Error("Only admins can delete subjects");

  try {
    const subject = await prisma.subject.findUnique({
      where: { id },
      include: {
        _count: { select: { topics: true } },
      },
    });
    if (!subject) throw new Error("Subject not found");
    if (subject._count.topics > 0)
      throw new Error("Remove all topics before deleting this subject");

    await prisma.subject.delete({ where: { id } });
    revalidateBank(session.user.role);
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("Failed to delete subject");
  }
};

// ── Topics ────────────────────────────────────────────────────────────────

export const getTopicById = async (id: string) => {
  const session = await requireExaminer();

  try {
    const topic = await prisma.topic.findUnique({
      where: { id },
      include: {
        subject: { select: { id: true, name: true } },
        questions: {
          orderBy: { createdAt: "desc" },
          include: {
            createdBy: { select: { name: true } },
          },
        },
      },
    });
    if (!topic) redirect(`${basePathFor(session.user.role)}/questions`);
    return topic;
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    throw new Error("Failed to fetch topic");
  }
};

export const createTopic = async (subjectId: string, formData: FormData) => {
  const session = await requireExaminer();

  try {
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
    });
    if (!subject) throw new Error("Subject not found");

    const name = (formData.get("name") as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || null;

    if (!name) throw new Error("Topic name is required");
    if (name.length > 100) throw new Error("Topic name is too long");

    await prisma.topic.create({
      data: {
        name,
        description,
        subjectId,
      },
    });

    revalidateBank(
      session.user.role,
      `${basePathFor(session.user.role)}/questions/subjects/${subjectId}`,
    );
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    )
      throw new Error("A topic with this name already exists in the subject");
    if (e instanceof Error) throw e;
    throw new Error("Failed to create topic");
  }
};

export const updateTopic = async (id: string, formData: FormData) => {
  const session = await requireExaminer();

  try {
    const existing = await prisma.topic.findUnique({ where: { id } });
    if (!existing) throw new Error("Topic not found");

    const name = (formData.get("name") as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || null;

    if (!name) throw new Error("Topic name is required");
    if (name.length > 100) throw new Error("Topic name is too long");

    await prisma.topic.update({
      where: { id },
      data: { name, description },
    });

    revalidateBank(
      session.user.role,
      `${basePathFor(session.user.role)}/questions/subjects/${existing.subjectId}`,
      `${basePathFor(session.user.role)}/questions/topics/${id}`,
    );
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    )
      throw new Error("A topic with this name already exists in the subject");
    if (e instanceof Error) throw e;
    throw new Error("Failed to update topic");
  }
};

export const deleteTopic = async (id: string) => {
  const session = await requireExaminer();
  if (session.user.role !== "admin")
    throw new Error("Only admins can delete topics");

  try {
    const topic = await prisma.topic.findUnique({
      where: { id },
      include: {
        _count: { select: { questions: true } },
      },
    });
    if (!topic) throw new Error("Topic not found");
    if (topic._count.questions > 0)
      throw new Error("Remove all questions before deleting this topic");

    await prisma.topic.delete({ where: { id } });
    revalidateBank(
      session.user.role,
      `${basePathFor(session.user.role)}/questions/subjects/${topic.subjectId}`,
    );
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("Failed to delete topic");
  }
};

// ── Bank questions ────────────────────────────────────────────────────────

export const getBankQuestions = async () => {
  await requireExaminer();

  try {
    return await prisma.bankQuestion.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { name: true } },
        topic: {
          select: {
            id: true,
            name: true,
            subject: { select: { id: true, name: true } },
          },
        },
      },
    });
  } catch {
    throw new Error("Failed to fetch bank questions");
  }
};

export const getBankHierarchy = async () => {
  await requireExaminer();

  try {
    return await prisma.subject.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: {
        topics: {
          orderBy: [{ order: "asc" }, { name: "asc" }],
          select: { id: true, name: true },
        },
      },
    });
  } catch {
    throw new Error("Failed to fetch bank hierarchy");
  }
};

export const getBankQuestionById = async (id: string) => {
  const session = await requireExaminer();

  try {
    const question = await prisma.bankQuestion.findUnique({
      where: { id },
      include: {
        createdBy: { select: { name: true } },
        topic: {
          select: {
            id: true,
            name: true,
            subjectId: true,
            subject: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!question) redirect(`${basePathFor(session.user.role)}/questions`);
    return question;
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    throw new Error("Failed to fetch bank question");
  }
};

export const createBankQuestion = async (formData: FormData) => {
  const session = await requireExaminer();

  try {
    const parsed = bankQuestionFormSchema.parse(Object.fromEntries(formData));

    const topic = await prisma.topic.findUnique({
      where: { id: parsed.topicId },
    });
    if (!topic) throw new Error("Topic not found");

    const grading = buildQuestionGradingFields({
      type: parsed.type,
      answer: parsed.answer,
      markingSchemeJson: parsed.markingScheme || null,
      partialCredit: parsed.partialCredit,
    });

    await prisma.bankQuestion.create({
      data: {
        text: parsed.text,
        type: parsed.type,
        options: parsed.options || null,
        answer: grading.answer,
        points: parsed.points,
        difficulty: parsed.difficulty ?? "medium",
        markingScheme: grading.markingScheme,
        topicId: parsed.topicId,
        createdById: session.user.id,
      },
    });

    const base = basePathFor(session.user.role);
    revalidateBank(
      session.user.role,
      `${base}/questions/topics/${parsed.topicId}`,
      `${base}/questions/subjects/${topic.subjectId}`,
      `${base}/exams`,
    );
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("Failed to create bank question");
  }
};

export const updateBankQuestion = async (id: string, formData: FormData) => {
  const session = await requireExaminer();

  try {
    const question = await prisma.bankQuestion.findUnique({ where: { id } });
    if (!question) throw new Error("Bank question not found");

    if (
      session.user.role !== "admin" &&
      question.createdById !== session.user.id
    )
      throw new Error("You can only edit bank questions you created");

    const parsed = bankQuestionFormSchema.parse(Object.fromEntries(formData));

    const topic = await prisma.topic.findUnique({
      where: { id: parsed.topicId },
    });
    if (!topic) throw new Error("Topic not found");

    const grading = buildQuestionGradingFields({
      type: parsed.type,
      answer: parsed.answer,
      markingSchemeJson: parsed.markingScheme || null,
      partialCredit: parsed.partialCredit,
    });

    await prisma.bankQuestion.update({
      where: { id },
      data: {
        text: parsed.text,
        type: parsed.type,
        options: parsed.options || null,
        answer: grading.answer,
        points: parsed.points,
        difficulty: parsed.difficulty ?? "medium",
        markingScheme: grading.markingScheme,
        topicId: parsed.topicId,
      },
    });

    const base = basePathFor(session.user.role);
    revalidateBank(
      session.user.role,
      `${base}/questions/${id}`,
      `${base}/questions/topics/${parsed.topicId}`,
      `${base}/questions/topics/${question.topicId}`,
      `${base}/questions/subjects/${topic.subjectId}`,
    );
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("Failed to update bank question");
  }
};

export const deleteBankQuestion = async (id: string) => {
  const session = await requireExaminer();
  if (session.user.role !== "admin")
    throw new Error("Only admins can delete bank questions");

  try {
    const question = await prisma.bankQuestion.findUnique({
      where: { id },
      include: { topic: { select: { id: true, subjectId: true } } },
    });
    if (!question) throw new Error("Bank question not found");

    await prisma.bankQuestion.delete({ where: { id } });

    const base = basePathFor(session.user.role);
    revalidateBank(
      session.user.role,
      `${base}/questions/topics/${question.topicId}`,
      `${base}/questions/subjects/${question.topic.subjectId}`,
    );
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("Failed to delete bank question");
  }
};

export const importBankQuestions = async (
  examId: string,
  questionIds: string[],
) => {
  const session = await requireExaminer();

  try {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: { _count: { select: { attempts: true } } },
    });
    if (!exam) throw new Error("Exam not found");

    if (session.user.role !== "admin" && exam.createdById !== session.user.id)
      throw new Error("You do not have permission to modify this exam");

    if (exam.status !== "draft")
      throw new Error("Questions can only be imported into draft exams");
    if (exam._count.attempts > 0)
      throw new Error("Cannot modify questions on an exam with attempts");

    const bankQuestions = await prisma.bankQuestion.findMany({
      where: { id: { in: questionIds } },
    });

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await prisma.$transaction(
          async (tx) => {
            const maxOrder = await tx.question.findFirst({
              where: { examId },
              orderBy: { order: "desc" },
              select: { order: true },
            });

            let order = (maxOrder?.order ?? -1) + 1;

            await tx.question.createMany({
              data: bankQuestions.map((q) => ({
                examId,
                text: q.text,
                type: q.type,
                options: q.options,
                answer: q.answer,
                points: q.points,
                difficulty: q.difficulty,
                markingScheme: q.markingScheme,
                order: order++,
              })),
            });
          },
          { isolationLevel: "Serializable" },
        );
        lastError = null;
        break;
      } catch (e) {
        if (
          typeof e === "object" &&
          e !== null &&
          "code" in e &&
          (e as { code: string }).code === "P2034"
        ) {
          lastError =
            e instanceof Error ? e : new Error("Serialization conflict");
          continue;
        }
        throw e;
      }
    }
    if (lastError) throw lastError;

    await refreshExamTotalMarks(examId);

    const basePath = basePathFor(session.user.role);
    revalidatePath(`${basePath}/exams/${examId}`);
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("Failed to import bank questions");
  }
};

export const importRandomBankQuestions = async (
  examId: string,
  input: {
    count: number;
    subjectId?: string;
    topicId?: string;
    difficulty?: string;
    type?: string;
  },
) => {
  const session = await requireExaminer();

  try {
    const parsed = randomImportSchema.parse(input);
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: { _count: { select: { attempts: true } } },
    });
    if (!exam) throw new Error("Exam not found");

    if (session.user.role !== "admin" && exam.createdById !== session.user.id)
      throw new Error("You do not have permission to modify this exam");

    if (exam.status !== "draft")
      throw new Error("Questions can only be imported into draft exams");
    if (exam._count.attempts > 0)
      throw new Error("Cannot modify questions on an exam with attempts");

    const conditions: Prisma.Sql[] = [];
    if (parsed.topicId)
      conditions.push(Prisma.sql`bq."topicId" = ${parsed.topicId}`);
    if (parsed.subjectId)
      conditions.push(
        Prisma.sql`t."subjectId" = ${parsed.subjectId}`,
      );
    if (parsed.difficulty)
      conditions.push(Prisma.sql`bq."difficulty" = ${parsed.difficulty}`);
    if (parsed.type) conditions.push(Prisma.sql`bq."type" = ${parsed.type}`);

    // Exclude bank questions whose text+type already exist on this exam
    conditions.push(Prisma.sql`NOT EXISTS (
      SELECT 1 FROM "question" q
      WHERE q."examId" = ${examId}
        AND q."text" = bq."text"
        AND q."type" = bq."type"
    )`);

    const whereSql =
      conditions.length > 0 ?
        Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
      : Prisma.empty;

    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT bq."id"
      FROM "bank_question" bq
      JOIN "topic" t ON t."id" = bq."topicId"
      ${whereSql}
      ORDER BY RANDOM()
      LIMIT ${parsed.count}
    `;

    if (rows.length === 0)
      throw new Error("No matching bank questions available to import");

    await importBankQuestions(
      examId,
      rows.map((r) => r.id),
    );
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("Failed to randomly import bank questions");
  }
};
