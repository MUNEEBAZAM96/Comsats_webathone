import {
  MAX_EVENTS_PER_CALL,
  type AttemptEventInput,
  type AttemptEventType,
} from "@/lib/exam/syncSchemas";
import { getOfflineDb } from "./db";
import type { LocalEvent } from "./types";

type ClientEventType = Exclude<AttemptEventType, "auto_submitted">;
type Detail = Record<string, string | number | boolean>;

/**
 * Buffer workspace signals locally and send them in small batches. Events are
 * informational for staff; losing a few is acceptable, blocking the exam is not.
 */
export const createEventBuffer = (options: {
  attemptId: string;
  send: (events: AttemptEventInput[]) => Promise<{ ok: boolean }>;
}) => {
  const { attemptId, send } = options;
  const memory: LocalEvent[] = [];
  let flushing = false;

  const push = async (type: ClientEventType, detail?: Detail) => {
    const event: LocalEvent = {
      id: crypto.randomUUID(),
      attemptId,
      type,
      ...(detail ? { detail } : {}),
      clientAt: Date.now(),
    };
    try {
      const db = await getOfflineDb();
      await db.put("events", event);
    } catch {
      memory.push(event);
    }
  };

  const flush = async () => {
    if (flushing) return;
    flushing = true;
    try {
      let stored: LocalEvent[] = [];
      try {
        const db = await getOfflineDb();
        stored = await db.getAllFromIndex("events", "by-attempt", attemptId);
      } catch {
        stored = [];
      }
      const batch = [...stored, ...memory]
        .sort((a, b) => a.clientAt - b.clientAt)
        .slice(0, MAX_EVENTS_PER_CALL);
      if (batch.length === 0) return;

      // A rejected batch (finished attempt, cap reached) is dropped either way;
      // only a network failure keeps events for the next flush.
      await send(
        batch.map((e) => ({
          type: e.type as ClientEventType,
          ...(e.detail ? { detail: e.detail } : {}),
          clientAt: e.clientAt,
        })),
      );

      const sent = new Set(batch.map((e) => e.id));
      const remaining = memory.filter((e) => !sent.has(e.id));
      memory.splice(0, memory.length, ...remaining);
      try {
        const db = await getOfflineDb();
        const tx = db.transaction("events", "readwrite");
        await Promise.all(
          batch.filter((e) => stored.includes(e)).map((e) => tx.store.delete(e.id)),
        );
        await tx.done;
      } catch {
        // Storage gone; nothing left to clean.
      }
    } catch {
      // Network failure: keep the events.
    } finally {
      flushing = false;
    }
  };

  return { push, flush };
};

export type EventBuffer = ReturnType<typeof createEventBuffer>;
