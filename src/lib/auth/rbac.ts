import "server-only";
import { auth } from "@/auth";
import { getPermissionCodesForRoles } from "@/modules/org/db/permissions";

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

/**
 * Throws 403 unless the user holds the given permission code
 * (`<module>.<resource>:<action>`, e.g. `maintenance.asset:create`).
 * The protected `admin` profile bypasses without touching the DB — same
 * app-layer rule as `getNavForUser` (no grant rows for admin, ever).
 * Resolution is a per-request query by design: grants revoke immediately,
 * and the JWT stays small (plan 0006).
 */
export async function requirePermission(code: string): Promise<SessionUser> {
  const user = await requireUser();
  if (user.roles.includes("admin")) return user;
  const codes = await getPermissionCodesForRoles(user.roles);
  if (!codes.includes(code)) {
    throw new ForbiddenError();
  }
  return user;
}

/** Convenience: is the current user an admin? */
export async function isAdmin(): Promise<boolean> {
  const session = await auth().catch(() => null);
  return (session?.user?.roles ?? []).includes("admin");
}

/**
 * Server-side guard for admin-only pages. Returns true when the caller is an
 * admin; returns false (so the page can redirect) when forbidden.
 */
export async function assertAdminOrRedirect(): Promise<boolean> {
  try {
    await requireAnyRole(["admin"]);
    return true;
  } catch {
    return false;
  }
}
