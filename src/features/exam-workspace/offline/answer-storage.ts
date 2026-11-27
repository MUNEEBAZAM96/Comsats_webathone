import { getOfflineDb } from "./db";
import type { LocalAnswer } from "./types";

const keyFor = (attemptId: string, questionId: string) =>
  `${attemptId}:${questionId}`;

export const upsertLocalAnswer = async (input: {
  attemptId: string;
  questionId: string;
  text: string;
  idempotencyKey?: string;
}) => {
  const db = await getOfflineDb();
  const id = keyFor(input.attemptId, input.questionId);
  const existing = await db.get("answers", id);
  const row: LocalAnswer = {
    id,
    attemptId: input.attemptId,
    questionId: input.questionId,
    text: input.text,
    updatedAt: Date.now(),
    syncStatus: "pending",
    idempotencyKey:
      input.idempotencyKey ??
      existing?.idempotencyKey ??
      crypto.randomUUID(),
  };
  await db.put("answers", row);
  return row;
};

export const listLocalAnswers = async (attemptId: string) => {
  const db = await getOfflineDb();
  return db.getAllFromIndex("answers", "by-attempt", attemptId);
};

export const listPendingAnswers = async (attemptId: string) => {
  const all = await listLocalAnswers(attemptId);
  return all.filter((a) => a.syncStatus === "pending" || a.syncStatus === "failed");
};

export const markAnswerSynced = async (id: string) => {
  const db = await getOfflineDb();
  const row = await db.get("answers", id);
  if (!row) return;
  await db.put("answers", { ...row, syncStatus: "synced" });
};

export const markAnswerFailed = async (id: string) => {
  const db = await getOfflineDb();
  const row = await db.get("answers", id);
  if (!row) return;
  await db.put("answers", { ...row, syncStatus: "failed" });
};

/** Clear plaintext local answers after successful submit or logout. */
export const clearAttemptAnswers = async (attemptId: string) => {
  const db = await getOfflineDb();
  const rows = await db.getAllFromIndex("answers", "by-attempt", attemptId);
  await Promise.all(rows.map((row) => db.delete("answers", row.id)));
};
