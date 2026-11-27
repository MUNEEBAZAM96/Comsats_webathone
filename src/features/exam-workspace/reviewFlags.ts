"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * "Mark for review" flags, persisted per attempt in localStorage so a refresh
 * keeps them. UX only — flags never reach the server or affect grading.
 */

const CHANGE_EVENT = "exam-review-flags-change";
const EMPTY = "[]";
const memoryFallback = new Map<string, string>();

const storageKey = (attemptId: string) => `exam-review-flags:${attemptId}`;

const readRaw = (attemptId: string) => {
  try {
    return window.localStorage.getItem(storageKey(attemptId)) ?? EMPTY;
  } catch {
    return memoryFallback.get(attemptId) ?? EMPTY;
  }
};

const writeRaw = (attemptId: string, value: string | null) => {
  try {
    if (value === null) window.localStorage.removeItem(storageKey(attemptId));
    else window.localStorage.setItem(storageKey(attemptId), value);
  } catch {
    if (value === null) memoryFallback.delete(attemptId);
    else memoryFallback.set(attemptId, value);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

const parse = (raw: string): string[] => {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ?
        value.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
};

const subscribe = (onChange: () => void) => {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
};

export const useReviewFlags = (attemptId: string, questionIds: string[]) => {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(attemptId),
    () => EMPTY,
  );

  const flagged = useMemo(() => {
    const known = new Set(questionIds);
    return parse(raw).filter((id) => known.has(id));
  }, [raw, questionIds]);

  const toggle = useCallback(
    (questionId: string) => {
      const current = parse(readRaw(attemptId));
      const next =
        current.includes(questionId) ?
          current.filter((id) => id !== questionId)
        : [...current, questionId];
      writeRaw(attemptId, JSON.stringify(next));
    },
    [attemptId],
  );

  return { flagged, toggle };
};

export const clearReviewFlags = (attemptId: string) => writeRaw(attemptId, null);
