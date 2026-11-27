import { getOfflineDb } from "./db";
import type { LocalAnswer, OfflineMeta } from "./types";

const keyFor = (attemptId: string, questionId: string) =>
  `${attemptId}:${questionId}`;

const newKey = () => crypto.randomUUID();

/**
 * Record an edit locally and give it the next sequence number for this
 * question. Runs in one readwrite transaction so concurrent tabs (which share
 * IndexedDB) never hand out the same sequence twice.
 */
export const upsertLocalAnswer = async (input: {
  attemptId: string;
  questionId: string;
  text: string;
}): Promise<LocalAnswer> => {
  const db = await getOfflineDb();
  const tx = db.transaction("answers", "readwrite");
  const id = keyFor(input.attemptId, input.questionId);
  const existing = await tx.store.get(id);

  if (existing && existing.text === input.text) {
    await tx.done;
    return existing;
  }

  const clientSeq = Math.max(existing?.clientSeq ?? 0, existing?.ackSeq ?? 0) + 1;
  const row: LocalAnswer = {
    id,
    attemptId: input.attemptId,
    questionId: input.questionId,
    text: input.text,
    updatedAt: Date.now(),
    syncStatus: "pending",
    idempotencyKey: newKey(),
    clientSeq,
    ackSeq: existing?.ackSeq ?? 0,
    attempts: 0,
    lastError: null,
    nextRetryAt: null,
  };
  await tx.store.put(row);
  await tx.done;
  return row;
};

export const getLocalAnswer = async (attemptId: string, questionId: string) => {
  const db = await getOfflineDb();
  return db.get("answers", keyFor(attemptId, questionId));
};

export const listLocalAnswers = async (attemptId: string) => {
  const db = await getOfflineDb();
  return db.getAllFromIndex("answers", "by-attempt", attemptId);
};

export const listPendingAnswers = async (attemptId: string) => {
  const all = await listLocalAnswers(attemptId);
  return all.filter((a) => a.syncStatus === "pending" || a.syncStatus === "failed");
};

/**
 * The server acknowledged `seq`. Only mark the row synced if no newer edit was
 * recorded while the request was in flight.
 */
export const markAnswerSynced = async (
  attemptId: string,
  questionId: string,
  seq: number,
) => {
  const db = await getOfflineDb();
  const tx = db.transaction("answers", "readwrite");
  const row = await tx.store.get(keyFor(attemptId, questionId));
  if (row) {
    await tx.store.put({
      ...row,
      ackSeq: Math.max(row.ackSeq ?? 0, seq),
      ...(row.clientSeq <= seq ?
        { syncStatus: "synced" as const, attempts: 0, lastError: null, nextRetryAt: null }
      : {}),
    });
  }
  await tx.done;
};

export const markAnswerFailed = async (
  attemptId: string,
  questionId: string,
  seq: number,
  error: string,
  nextRetryAt: number | null,
) => {
  const db = await getOfflineDb();
  const tx = db.transaction("answers", "readwrite");
  const row = await tx.store.get(keyFor(attemptId, questionId));
  if (row && row.clientSeq === seq) {
    await tx.store.put({
      ...row,
      syncStatus: "failed",
      attempts: (row.attempts ?? 0) + 1,
      lastError: error.slice(0, 200),
      nextRetryAt,
    });
  }
  await tx.done;
};

/** The server holds a newer copy (another tab or device): adopt it. */
export const applyServerCopy = async (
  attemptId: string,
  questionId: string,
  text: string,
  seq: number,
) => {
  const db = await getOfflineDb();
  const tx = db.transaction("answers", "readwrite");
  const id = keyFor(attemptId, questionId);
  const row = await tx.store.get(id);
  if (!row || row.clientSeq <= seq) {
    await tx.store.put({
      id,
      attemptId,
      questionId,
      text,
      updatedAt: Date.now(),
      syncStatus: "synced",
      idempotencyKey: row?.idempotencyKey ?? newKey(),
      clientSeq: seq,
      ackSeq: Math.max(row?.ackSeq ?? 0, seq),
      attempts: 0,
      lastError: null,
      nextRetryAt: null,
    });
  }
  await tx.done;
};

/**
 * Merge the server's copy after a page load. Server rows at least as new as the
 * local row replace it; local rows with a higher sequence are returned so the
 * caller can restore and re-send them.
 */
export const seedSeqFromServer = async (
  attemptId: string,
  serverRows: { questionId: string; clientSeq: number; text: string | null }[],
): Promise<LocalAnswer[]> => {
  const db = await getOfflineDb();
  const tx = db.transaction("answers", "readwrite");
  const serverMap = new Map(serverRows.map((r) => [r.questionId, r]));
  const local = await tx.store.index("by-attempt").getAll(attemptId);
  const localMap = new Map(local.map((r) => [r.questionId, r]));
  const recovered: LocalAnswer[] = [];

  for (const server of serverRows) {
    const row = localMap.get(server.questionId);
    if (!row || row.clientSeq <= server.clientSeq) {
      await tx.store.put({
        id: keyFor(attemptId, server.questionId),
        attemptId,
        questionId: server.questionId,
        text: server.text ?? "",
        updatedAt: Date.now(),
        syncStatus: "synced",
        idempotencyKey: row?.idempotencyKey ?? newKey(),
        clientSeq: server.clientSeq,
        ackSeq: Math.max(row?.ackSeq ?? 0, server.clientSeq),
        attempts: 0,
        lastError: null,
        nextRetryAt: null,
      });
    } else if (row.syncStatus !== "synced") {
      recovered.push(row);
    }
  }
  for (const row of local) {
    if (serverMap.has(row.questionId) || row.syncStatus === "synced") continue;
    if (row.clientSeq < 1) {
      const fixed = { ...row, clientSeq: 1 };
      await tx.store.put(fixed);
      recovered.push(fixed);
    } else {
      recovered.push(row);
    }
  }
  await tx.done;
  return recovered;
};

export const saveClockMeta = async (
  attemptId: string,
  patch: Partial<Omit<OfflineMeta, "attemptId">>,
) => {
  const db = await getOfflineDb();
  const current = await db.get("meta", attemptId);
  await db.put("meta", {
    lastOnlineAt: null,
    lastSyncAt: null,
    ...current,
    ...patch,
    attemptId,
  });
};

/** Clear plaintext local answers and buffered events after submit. */
export const clearAttemptAnswers = async (attemptId: string) => {
  const db = await getOfflineDb();
  const tx = db.transaction(["answers", "events", "meta"], "readwrite");
  const answers = await tx.objectStore("answers").index("by-attempt").getAllKeys(attemptId);
  const events = await tx.objectStore("events").index("by-attempt").getAllKeys(attemptId);
  await Promise.all([
    ...answers.map((key) => tx.objectStore("answers").delete(key)),
    ...events.map((key) => tx.objectStore("events").delete(key)),
    tx.objectStore("meta").delete(attemptId),
  ]);
  await tx.done;
};
