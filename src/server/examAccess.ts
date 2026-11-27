import "server-only";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { statement } from "@/lib/auth/permissions";
import prisma from "@/lib/database/dbClient";

export type StaffRole = "admin" | "examiner" | "proctor";

export type StaffSession = {
  user: { id: string; name: string; email: string; role: StaffRole };
};

/** Thrown for permission problems; the message is safe to show. */
export class AccessError extends Error {
  constructor(message = "You do not have access to this exam") {
    super(message);
    this.name = "AccessError";
  }
}

const isStaffRole = (role: unknown): role is StaffRole =>
  role === "admin" || role === "examiner" || role === "proctor";

/** Current staff session, or null for students and signed-out visitors. */
export const getStaffSession = async (): Promise<StaffSession | null> => {
  const session = await auth.api
    .getSession({ headers: await headers() })
    .catch(() => null);
  if (!session || !isStaffRole(session.user.role)) return null;
  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role,
    },
  };
};

export const requireStaffSession = async (...roles: StaffRole[]) => {
  const session = await getStaffSession();
  if (!session) throw new AccessError("Your session has ended. Sign in again.");
  if (roles.length > 0 && !roles.includes(session.user.role))
    throw new AccessError("Your role cannot perform this action");
  return session;
};

const examAccessSelect = {
  id: true,
  title: true,
  createdById: true,
  status: true,
  startTime: true,
  endTime: true,
  duration: true,
  resultsPublishedAt: true,
  resultsPublishedById: true,
  resultReveal: true,
  passMarkPercent: true,
  totalMarks: true,
} as const;

const loadExam = async (examId: unknown) => {
  if (typeof examId !== "string" || examId.length === 0 || examId.length > 64)
    throw new AccessError("Exam not found");
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: examAccessSelect,
  });
  if (!exam) throw new AccessError("Exam not found");
  return exam;
};

/**
 * Read live state, events, incidents and results: admin, the owning examiner,
 * or a proctor assigned to the exam.
 */
export const assertCanMonitorExam = async (
  examId: unknown,
  session: StaffSession,
) => {
  const exam = await loadExam(examId);
  const { id: userId, role } = session.user;
  if (role === "admin") return exam;
  if (role === "examiner" && exam.createdById === userId) return exam;
  if (role === "proctor") {
    const assigned = await prisma.examProctor.findUnique({
      where: { examId_proctorId: { examId: exam.id, proctorId: userId } },
      select: { id: true },
    });
    if (assigned) return exam;
  }
  throw new AccessError();
};

/** Grade, publish, regrade and manage: admin or the owning examiner. */
export const assertCanManageExam = async (
  examId: unknown,
  session: StaffSession,
) => {
  const exam = await loadExam(examId);
  const { id: userId, role } = session.user;
  if (role === "admin") return exam;
  if (role === "examiner" && exam.createdById === userId) return exam;
  throw new AccessError();
};

type PermissionMap = {
  [K in keyof typeof statement]?: (typeof statement)[K][number][];
};

/** Better Auth access-control check, in addition to exam scoping. */
export const assertPermission = async (
  session: StaffSession,
  permissions: PermissionMap,
) => {
  const { success } = await auth.api
    .userHasPermission({ body: { userId: session.user.id, permissions } })
    .catch(() => ({ success: false as const }));
  if (!success) throw new AccessError("Your role cannot perform this action");
};

/** Staff home for building links in shared components. */
export const staffBasePath = (role: StaffRole) =>
  role === "admin" ? "/admin"
  : role === "examiner" ? "/examiner"
  : "/proctor";
