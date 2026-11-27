import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export type Role = "admin" | "examiner" | "proctor" | "student";

/**
 * Anything that is not a staff role is treated as a student, which matches the
 * login redirect and the role layouts.
 */
const roleOf = (role?: string | null): Role =>
  role === "admin" || role === "examiner" || role === "proctor" ?
    role
  : "student";

const homeFor = (role: Role) =>
  role === "admin" ? "/admin"
  : role === "examiner" ? "/examiner"
  : role === "proctor" ? "/proctor"
  : "/student";

/** The current Better Auth session, read once per render pass. */
export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

/**
 * Server-side gate for pages and data functions.
 *
 * A layout does not stop the page below it from rendering: Next.js renders
 * route segments independently, so a redirect thrown in a layout still leaves
 * the page's output in the RSC payload. Every private page therefore has to
 * check the session itself, either with these helpers or through a data
 * function that does.
 */
export const requireSession = async () => {
  const session = await getSession();
  if (!session) redirect("/");
  return session;
};

/** Like `requireSession`, and sends other roles to their own dashboard. */
export const requireRole = async (...roles: Role[]) => {
  const session = await requireSession();
  const role = roleOf(session.user.role);
  if (!roles.includes(role)) redirect(homeFor(role));
  return session;
};
