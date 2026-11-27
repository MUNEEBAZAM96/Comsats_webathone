import { openDB, type DBSchema, type IDBPDatabase } from "idb";

interface ScratchpadDB extends DBSchema {
  strokes: {
    key: string;
    value: {
      attemptId: string;
      strokesJson: string;
      notes?: string;
      updatedAt: number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<ScratchpadDB>> | null = null;

const getDb = () => {
  if (!dbPromise) {
    dbPromise = openDB<ScratchpadDB>("exam-scratchpad", 1, {
      upgrade(db) {
        db.createObjectStore("strokes", { keyPath: "attemptId" });
      },
    });
  }
  return dbPromise;
};

export const saveScratchpad = async (
  attemptId: string,
  strokesJson: string,
  notes = "",
) => {
  const db = await getDb();
  await db.put("strokes", {
    attemptId,
    strokesJson,
    notes,
    updatedAt: Date.now(),
  });
};

export const loadScratchpad = async (attemptId: string) => {
  const db = await getDb();
  return (await db.get("strokes", attemptId)) ?? null;
};

export const clearScratchpad = async (attemptId: string) => {
  const db = await getDb();
  await db.delete("strokes", attemptId);
};
