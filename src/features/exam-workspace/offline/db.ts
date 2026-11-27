import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { LocalAnswer, LocalEvent, OfflineMeta } from "./types";

interface ExamOfflineDB extends DBSchema {
  answers: {
    key: string;
    value: LocalAnswer;
    indexes: { "by-attempt": string; "by-sync": string };
  };
  meta: {
    key: string;
    value: OfflineMeta;
  };
  events: {
    key: string;
    value: LocalEvent;
    indexes: { "by-attempt": string };
  };
}

let dbPromise: Promise<IDBPDatabase<ExamOfflineDB>> | null = null;

export const getOfflineDb = () => {
  if (!dbPromise) {
    dbPromise = openDB<ExamOfflineDB>("exam-offline-answers", 2, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          const store = db.createObjectStore("answers", { keyPath: "id" });
          store.createIndex("by-attempt", "attemptId");
          store.createIndex("by-sync", "syncStatus");
          db.createObjectStore("meta", { keyPath: "attemptId" });
        }
        if (oldVersion < 2) {
          const events = db.createObjectStore("events", { keyPath: "id" });
          events.createIndex("by-attempt", "attemptId");
          // v1 rows predate sequence numbers; start them at 0 so the next
          // edit (or the server seed) moves them forward.
          let cursor = await tx.objectStore("answers").openCursor();
          while (cursor) {
            const row = cursor.value as Partial<LocalAnswer> & LocalAnswer;
            await cursor.update({
              ...row,
              clientSeq: row.clientSeq ?? 0,
              ackSeq: row.ackSeq ?? 0,
              attempts: row.attempts ?? 0,
              lastError: row.lastError ?? null,
              nextRetryAt: row.nextRetryAt ?? null,
            });
            cursor = await cursor.continue();
          }
        }
      },
    }).catch((error) => {
      // Private browsing / blocked storage: let the next call try again and
      // let callers fall back to memory.
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
};
