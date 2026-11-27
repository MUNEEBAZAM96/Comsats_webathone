import "server-only";

import { AccessError } from "@/server/examAccess";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** An expected failure whose message is safe to show to the user. */
export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionError";
  }
}

/**
 * Production builds hide thrown error messages from the client, so actions
 * return expected failures as values instead.
 */
export const runAction = async <T>(
  fn: () => Promise<T>,
): Promise<ActionResult<T>> => {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AccessError || e instanceof ActionError)
      return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
};
