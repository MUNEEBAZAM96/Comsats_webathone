"use client";

import { useSyncExternalStore } from "react";

/**
 * `navigator.onLine` only knows about the network interface. A request that
 * failed (captive portal, dead Wi-Fi, server unreachable) also counts as
 * offline until the next request succeeds or the browser reports `online`.
 */
let lastRequestOk = true;
const listeners = new Set<() => void>();
let windowListenersAttached = false;

const notify = () => {
  for (const listener of listeners) listener();
};

const attachWindowListeners = () => {
  if (windowListenersAttached || typeof window === "undefined") return;
  windowListenersAttached = true;
  window.addEventListener("online", () => {
    lastRequestOk = true;
    notify();
  });
  window.addEventListener("offline", notify);
};

export const reportNetworkResult = (ok: boolean) => {
  if (ok === lastRequestOk) return;
  lastRequestOk = ok;
  notify();
};

export const isEffectivelyOnline = () =>
  (typeof navigator === "undefined" || navigator.onLine) && lastRequestOk;

const subscribe = (listener: () => void) => {
  attachWindowListeners();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useOnlineStatus = () =>
  useSyncExternalStore(subscribe, isEffectivelyOnline, () => true);
