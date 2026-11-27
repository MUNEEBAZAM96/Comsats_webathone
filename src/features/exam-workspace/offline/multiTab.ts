"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * "checking" and "active" may edit. "blocked" means another tab already holds
 * the attempt; "taken_over" means another tab took it from this one.
 */
export type TabRole = "checking" | "active" | "blocked" | "taken_over";

type TabGuard = { takeOver: () => void; dispose: () => void };

const createLockGuard = (
  locks: LockManager,
  name: string,
  setRole: (role: TabRole) => void,
): TabGuard => {
  let disposed = false;
  let generation = 0;
  let release: (() => void) | null = null;
  let queued: AbortController | null = null;

  const acquire = (mode: "try" | "wait" | "steal") => {
    const gen = ++generation;
    let opts: LockOptions;
    if (mode === "try") opts = { ifAvailable: true };
    else if (mode === "steal") opts = { steal: true };
    else {
      queued = new AbortController();
      opts = { signal: queued.signal };
    }

    const run = async () => {
      try {
        const outcome = await locks.request(name, opts, async (lock) => {
          if (!lock) return "unavailable" as const;
          if (disposed) return "held" as const;
          setRole("active");
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return "held" as const;
        });
        if (disposed || gen !== generation) return;
        if (outcome === "unavailable") {
          setRole("blocked");
          // Becomes active by itself once the other tab closes.
          acquire("wait");
        }
      } catch {
        // Rejected because another tab stole the lock.
        if (disposed || gen !== generation) return;
        setRole("taken_over");
      }
    };
    void run();
  };

  acquire("try");

  return {
    takeOver: () => {
      queued?.abort();
      acquire("steal");
    },
    dispose: () => {
      disposed = true;
      queued?.abort();
      release?.();
    },
  };
};

const createChannelGuard = (
  name: string,
  setRole: (role: TabRole) => void,
): TabGuard => {
  const tabId = crypto.randomUUID();
  const channel = new BroadcastChannel(name);
  let role: TabRole = "checking";
  const set = (next: TabRole) => {
    role = next;
    setRole(next);
  };

  channel.onmessage = (event: MessageEvent<{ type: string; tabId: string }>) => {
    const msg = event.data;
    if (!msg || msg.tabId === tabId) return;
    if (msg.type === "hello" && role === "active")
      channel.postMessage({ type: "present", tabId });
    else if (msg.type === "present" && role === "checking") set("blocked");
    else if (msg.type === "takeover" && role !== "taken_over") set("taken_over");
  };

  channel.postMessage({ type: "hello", tabId });
  const timer = setTimeout(() => {
    if (role === "checking") set("active");
  }, 300);

  return {
    takeOver: () => {
      channel.postMessage({ type: "takeover", tabId });
      set("active");
    },
    dispose: () => {
      clearTimeout(timer);
      channel.close();
    },
  };
};

/**
 * One editing tab per attempt. Uses the Web Locks API (shared across tabs of
 * the same browser profile) and falls back to BroadcastChannel.
 */
export const useAttemptTabGuard = (attemptId: string, enabled: boolean) => {
  const [role, setRole] = useState<TabRole>("checking");
  const guardRef = useRef<TabGuard | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const name = `exam-attempt:${attemptId}`;
    let guard: TabGuard;
    if (typeof navigator !== "undefined" && "locks" in navigator && navigator.locks)
      guard = createLockGuard(navigator.locks, name, setRole);
    else if (typeof BroadcastChannel !== "undefined")
      guard = createChannelGuard(name, setRole);
    else {
      const timer = setTimeout(() => setRole("active"), 0);
      guard = { takeOver: () => setRole("active"), dispose: () => clearTimeout(timer) };
    }
    guardRef.current = guard;
    return () => {
      guard.dispose();
      guardRef.current = null;
    };
  }, [attemptId, enabled]);

  const takeOver = useCallback(() => {
    guardRef.current?.takeOver();
  }, []);

  return { role, takeOver };
};
