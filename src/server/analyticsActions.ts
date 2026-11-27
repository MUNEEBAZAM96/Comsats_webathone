"use server";

import "server-only";

import { redirect } from "next/navigation";
import { getExamAnalytics } from "@/features/analytics/services/examAnalytics";
import {
  AccessError,
  assertCanManageExam,
  assertPermission,
  requireStaffSession,
} from "@/server/examAccess";

/** Analytics are for the exam's managers (admin or owning examiner); proctors do not see them. */
export const loadExamAnalytics = async (examId: string) => {
  try {
    const session = await requireStaffSession("admin", "examiner");
    await assertPermission(session, { result: ["read"] });
    await assertCanManageExam(examId, session);
  } catch (e) {
    if (e instanceof AccessError) redirect("/");
    throw e;
  }
  return getExamAnalytics(examId);
};
