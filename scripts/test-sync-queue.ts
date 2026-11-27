import assert from "node:assert/strict";
import type {
  SaveAnswerItem,
  SaveAnswersResult,
} from "../src/lib/exam/syncSchemas";
import {
  backoffDelay,
  createAnswerSyncQueue,
  type AnswerStorage,
} from "../src/features/exam-workspace/offline/sync-manager";

type Row = { text: string; seq: number; synced: number; error: string | null };

const memoryStorage = () => {
  const rows = new Map<string, Row>();
  const storage: AnswerStorage = {
    upsert: async (_attemptId, questionId, text) => {
      const prev = rows.get(questionId);
      const seq = (prev?.seq ?? 0) + 1;
      rows.set(questionId, {
        text,
        seq,
        synced: prev?.synced ?? 0,
        error: null,
      });
      return { clientSeq: seq, idempotencyKey: `key-${questionId}-${seq}` };
    },
    markSynced: async (_attemptId, questionId, seq) => {
      const row = rows.get(questionId);
      // Never mark a newer local edit as synced by an older acknowledgement.
      if (row && row.seq <= seq) row.synced = seq;
    },
    markFailed: async (_attemptId, questionId, _seq, error) => {
      const row = rows.get(questionId);
      if (row) row.error = error;
    },
    applyServerCopy: async (_attemptId, questionId, text, seq) => {
      rows.set(questionId, { text, seq, synced: seq, error: null });
    },
  };
  return { storage, rows };
};

const manualTimers = () => {
  let next = 1;
  const timers = new Map<number, { fn: () => void; ms: number }>();
  return {
    setTimer: (fn: () => void, ms: number) => {
      const id = next++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimer: (handle: unknown) => {
      timers.delete(handle as number);
    },
    pendingDelays: () => [...timers.values()].map((t) => t.ms),
    fireAll: () => {
      const all = [...timers.entries()];
      timers.clear();
      for (const [, t] of all) t.fn();
    },
  };
};

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => {
  for (let i = 0; i < 10; i++) await tick();
};

const okResult = (
  items: SaveAnswerItem[],
  status: "saved" | "duplicate" = "saved",
): SaveAnswersResult => ({
  ok: true,
  serverTime: new Date().toISOString(),
  results: items.map((i) => ({
    questionId: i.questionId,
    status,
    serverSeq: i.clientSeq,
  })),
});

let passed = 0;
const test = async (name: string, fn: () => Promise<void>) => {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
};

const main = async () => {
  console.log("sync queue");

  await test("automatic retry stops after five failures and manual retry can recover", async () => {
    const { storage } = memoryStorage();
    const timers = manualTimers();
    let requests = 0;
    const queue = createAnswerSyncQueue({
      attemptId: "bounded",
      storage,
      isOnline: () => true,
      ...timers,
      send: async (items) => {
        if (++requests <= 5) throw new Error("Temporary network error");
        return okResult(items);
      },
    });
    await queue.enqueue("q", "locally stored");
    for (let n = 0; n < 5; n++) {
      timers.fireAll();
      await settle();
    }
    assert.equal(requests, 5);
    assert.equal(queue.getSnapshot().state, "error");
    assert.equal(queue.getSnapshot().pendingCount, 1);
    assert.deepEqual(timers.pendingDelays(), []);
    await queue.retryNow();
    assert.equal(queue.getSnapshot().state, "synced");
  });

  await test("backoff grows 1s,2s,4s… capped at 30s with ±20% jitter", async () => {
    assert.equal(
      backoffDelay(1, () => 0.5),
      1000,
    );
    assert.equal(
      backoffDelay(2, () => 0.5),
      2000,
    );
    assert.equal(
      backoffDelay(4, () => 0.5),
      8000,
    );
    assert.equal(
      backoffDelay(10, () => 0.5),
      30000,
    );
    assert.equal(
      backoffDelay(1, () => 0),
      800,
    );
    assert.equal(
      backoffDelay(1, () => 1),
      1200,
    );
  });

  await test("rapid edits coalesce into one write per question", async () => {
    const { storage, rows } = memoryStorage();
    const timers = manualTimers();
    const sent: SaveAnswerItem[][] = [];
    const queue = createAnswerSyncQueue({
      attemptId: "a1",
      storage,
      send: async (items) => {
        sent.push(items);
        return okResult(items);
      },
      isOnline: () => true,
      ...timers,
    });
    await queue.enqueue("q1", "a");
    await queue.enqueue("q1", "ab");
    await queue.enqueue("q1", "abc");
    await queue.enqueue("q2", "x");
    assert.equal(queue.getSnapshot().pendingCount, 2);
    timers.fireAll();
    await settle();
    assert.equal(sent.length, 1);
    assert.deepEqual(
      sent[0].map((i) => [i.questionId, i.text, i.clientSeq]),
      [
        ["q1", "abc", 3],
        ["q2", "x", 1],
      ],
    );
    assert.equal(queue.getSnapshot().state, "synced");
    assert.equal(rows.get("q1")?.synced, 3);
  });

  await test("identical text is not re-queued", async () => {
    const { storage } = memoryStorage();
    const timers = manualTimers();
    let calls = 0;
    const queue = createAnswerSyncQueue({
      attemptId: "a1",
      storage,
      send: async (items) => {
        calls++;
        return okResult(items);
      },
      isOnline: () => true,
      ...timers,
    });
    await queue.enqueue("q1", "same");
    timers.fireAll();
    await settle();
    await queue.enqueue("q1", "same");
    timers.fireAll();
    await settle();
    assert.equal(calls, 1);
  });

  await test("network failure keeps the answer and backs off", async () => {
    const { storage, rows } = memoryStorage();
    const timers = manualTimers();
    let fail = true;
    const queue = createAnswerSyncQueue({
      attemptId: "a1",
      storage,
      send: async (items) => {
        if (fail) throw new Error("offline");
        return okResult(items);
      },
      isOnline: () => true,
      random: () => 0.5,
      ...timers,
    });
    await queue.enqueue("q1", "draft");
    timers.fireAll();
    await settle();
    let snap = queue.getSnapshot();
    assert.equal(snap.state, "retrying");
    assert.equal(snap.pendingCount, 1);
    assert.equal(rows.get("q1")?.error, "offline");
    assert.deepEqual(timers.pendingDelays(), [1000]);
    timers.fireAll();
    await settle();
    assert.deepEqual(timers.pendingDelays(), [2000]);
    timers.fireAll();
    await settle();
    assert.equal(queue.getSnapshot().state, "error");
    fail = false;
    await queue.retryNow();
    await settle();
    snap = queue.getSnapshot();
    assert.equal(snap.state, "synced");
    assert.equal(snap.failures, 0);
  });

  await test("offline device does not call the server", async () => {
    const { storage } = memoryStorage();
    const timers = manualTimers();
    let online = false;
    let calls = 0;
    const queue = createAnswerSyncQueue({
      attemptId: "a1",
      storage,
      send: async (items) => {
        calls++;
        return okResult(items);
      },
      isOnline: () => online,
      ...timers,
    });
    await queue.enqueue("q1", "offline answer");
    timers.fireAll();
    await settle();
    assert.equal(calls, 0);
    assert.equal(queue.getSnapshot().state, "offline");
    online = true;
    queue.notifyConnectivity();
    await settle();
    assert.equal(calls, 1);
    assert.equal(queue.getSnapshot().state, "synced");
  });

  await test("an ack for an older edit does not clear a newer one (race)", async () => {
    const { storage, rows } = memoryStorage();
    const timers = manualTimers();
    let release: (() => void) | null = null;
    const sent: SaveAnswerItem[][] = [];
    const queue = createAnswerSyncQueue({
      attemptId: "a1",
      storage,
      send: (items) => {
        sent.push(items);
        return new Promise((resolve) => {
          release = () => resolve(okResult(items));
        });
      },
      isOnline: () => true,
      ...timers,
    });
    await queue.enqueue("q1", "v1");
    timers.fireAll();
    await settle();
    assert.equal(sent.length, 1);
    await queue.enqueue("q1", "v2");
    release!();
    await settle();
    assert.equal(queue.hasPending("q1"), true, "v2 must still be pending");
    assert.equal(rows.get("q1")?.synced, 0, "storage must not mark v2 synced");
    timers.fireAll();
    await settle();
    release!();
    await settle();
    assert.equal(sent.length, 2);
    assert.equal(sent[1][0].text, "v2");
    assert.equal(queue.hasPending("q1"), false);
    assert.equal(rows.get("q1")?.synced, 2);
  });

  await test("stale result applies the server copy and notifies the UI", async () => {
    const { storage, rows } = memoryStorage();
    const timers = manualTimers();
    const stale: { questionId: string; text: string }[] = [];
    const queue = createAnswerSyncQueue({
      attemptId: "a1",
      storage,
      send: async (items) => ({
        ok: true,
        serverTime: new Date().toISOString(),
        results: items.map((i) => ({
          questionId: i.questionId,
          status: "stale" as const,
          serverSeq: 9,
          serverText: "from other device",
        })),
      }),
      isOnline: () => true,
      ...timers,
    });
    queue.setHandlers({
      onStale: ({ questionId, text }) => stale.push({ questionId, text }),
    });
    await queue.enqueue("q1", "mine");
    timers.fireAll();
    await settle();
    assert.deepEqual(stale, [{ questionId: "q1", text: "from other device" }]);
    assert.equal(rows.get("q1")?.text, "from other device");
    assert.equal(queue.hasPending("q1"), false);
    // The next local edit must outrank the server sequence.
    let seen: SaveAnswerItem | null = null;
    const q2 = createAnswerSyncQueue({
      attemptId: "a1",
      storage,
      send: async (items) => {
        seen = items[0];
        return okResult(items);
      },
      isOnline: () => true,
      ...timers,
    });
    q2.prime({
      server: [{ questionId: "q1", clientSeq: 9, text: "from other device" }],
    });
    await q2.enqueue("q1", "newer");
    timers.fireAll();
    await settle();
    assert.ok(seen && (seen as SaveAnswerItem).clientSeq > 9);
  });

  await test("deadline closes the queue and stops further writes", async () => {
    const { storage } = memoryStorage();
    const timers = manualTimers();
    const closed: string[] = [];
    let calls = 0;
    const queue = createAnswerSyncQueue({
      attemptId: "a1",
      storage,
      send: async () => {
        calls++;
        return { ok: false, reason: "deadline_passed", message: "Time is up" };
      },
      isOnline: () => true,
      ...timers,
    });
    queue.setHandlers({ onClosed: (reason) => closed.push(reason) });
    await queue.enqueue("q1", "late");
    timers.fireAll();
    await settle();
    assert.deepEqual(closed, ["deadline_passed"]);
    assert.equal(queue.getSnapshot().state, "closed");
    await queue.enqueue("q1", "later");
    timers.fireAll();
    await settle();
    assert.equal(calls, 1);
    assert.deepEqual(timers.pendingDelays(), []);
  });

  await test("invalid payload is fatal until Retry now", async () => {
    const { storage } = memoryStorage();
    const timers = manualTimers();
    let calls = 0;
    const queue = createAnswerSyncQueue({
      attemptId: "a1",
      storage,
      send: async () => {
        calls++;
        return { ok: false, reason: "invalid", message: "bad" };
      },
      isOnline: () => true,
      ...timers,
    });
    await queue.enqueue("q1", "x");
    timers.fireAll();
    await settle();
    assert.equal(queue.getSnapshot().state, "error");
    assert.deepEqual(timers.pendingDelays(), []);
    assert.equal(calls, 1);
  });

  await test("prime re-queues recovered local rows newer than the server", async () => {
    const { storage } = memoryStorage();
    const timers = manualTimers();
    const sent: SaveAnswerItem[] = [];
    const queue = createAnswerSyncQueue({
      attemptId: "a1",
      storage,
      send: async (items) => {
        sent.push(...items);
        return okResult(items, "duplicate");
      },
      isOnline: () => true,
      ...timers,
    });
    const accepted = queue.prime({
      server: [
        { questionId: "q1", clientSeq: 3, text: "server" },
        { questionId: "q2", clientSeq: 5, text: "server2" },
      ],
      recovered: [
        {
          questionId: "q1",
          text: "local newer",
          clientSeq: 4,
          idempotencyKey: "k-q1-4",
        },
        {
          questionId: "q2",
          text: "local older",
          clientSeq: 5,
          idempotencyKey: "k-q2-5",
        },
      ],
    });
    assert.deepEqual(accepted, [{ questionId: "q1", text: "local newer" }]);
    queue.start();
    timers.fireAll();
    await settle();
    assert.deepEqual(
      sent.map((i) => [i.questionId, i.idempotencyKey]),
      [["q1", "k-q1-4"]],
    );
    assert.equal(queue.getSnapshot().state, "synced");
  });

  await test("flushAll drains pending writes before submit", async () => {
    const { storage } = memoryStorage();
    const timers = manualTimers();
    const queue = createAnswerSyncQueue({
      attemptId: "a1",
      storage,
      send: async (items) => okResult(items),
      isOnline: () => true,
      ...timers,
    });
    await queue.enqueue("q1", "a");
    await queue.enqueue("q2", "b");
    assert.equal(await queue.flushAll(), true);
    assert.deepEqual(queue.getPendingItems(), []);
  });

  console.log(`\n${passed} sync queue tests passed`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
