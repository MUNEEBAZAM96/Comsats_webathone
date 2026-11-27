import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { LocalAnswer, OfflineMeta } from "./types";

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
}

let dbPromise: Promise<IDBPDatabase<ExamOfflineDB>> | null = null;

export const getOfflineDb = () => {
  if (!dbPromise) {
    dbPromise = openDB<ExamOfflineDB>("exam-offline-answers", 1, {
      upgrade(db) {
        const store = db.createObjectStore("answers", { keyPath: "id" });
        store.createIndex("by-attempt", "attemptId");
        store.createIndex("by-sync", "syncStatus");
        db.createObjectStore("meta", { keyPath: "attemptId" });
      },
    });
  }
  return dbPromise;
};
