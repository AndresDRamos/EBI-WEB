import "server-only";
import { auth } from "@/auth";
import { getUserScope as dbGetUserScope } from "@/lib/db/users";

/**
 * Server-side authorization helpers consumed by API route handlers and server
 * components. All functions rely on the JWT session (Auth.js Credentials ⇒
 * JWT strategy).
 *
 * Route protection (authn) is enforced by middleware; *authorization* (role
 * checks) is enforced here, in the Node runtime, so it can read the DB scope.
 */

export class UnauthenticatedError extends Error {}
export class ForbiddenError extends Error {}

export type SessionUser = {
  id: number;
  name: string | null;
  username: string;
  roles: string[];
};

/** Returns the authenticated user or throws 401-equivalent. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  const u = session?.user;
  if (!u || u.userId == null) {
    throw new UnauthenticatedError();
  }
  return {
    id: u.userId,
    name: u.name ?? null,
    username: u.username ?? "",
    roles: u.roles ?? [],
  };
}

/** Throws 403 unless the user holds any of the given roles. */
export async function requireAnyRole(roles: string[]): Promise<SessionUser> {
  const user = await requireUser();
  const has = roles.some((r) => user.roles.includes(r));
  if (!has) {
    throw new ForbiddenError();
  }
  return user;
}

/** Convenience: is the current user an admin? */
export async function isAdmin(): Promise<boolean> {
  const session = await auth().catch(() => null);
  return (session?.user?.roles ?? []).includes("admin");
}

export { ForbiddenError as Forbidden };

/**
 * Loads the data-scope for a user (plants + departments). Not bundled into
 * the JWT because it can be large/volatile. Shape mirrors what Power BI
 * `effectiveIdentity`/`CUSTOMDATA` will consume later.
 */
export async function getUserScope(userId: number) {
  return dbGetUserScope(userId);
}