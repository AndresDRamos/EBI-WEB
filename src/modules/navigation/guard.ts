import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCachedNav, navRoleKey } from "./cache";

/**
 * Page-level authorization for a portal module: a user may reach a route only
 * if the nav section that owns it (`nav_section.code`) resolves visible for
 * them. This is the enforcement counterpart to the topbar/sidebar — *what is
 * shown = what is reachable* — closing the gap where a granted-only section
 * was still hit by direct URL (plan 0007, ADR 0005).
 *
 * Resolution reuses `getCachedNav`, so it inherits exactly the visibility
 * rules: the protected `admin` role bypasses (sees every section, active or
 * not), inactive sections are unreachable for everyone else, and the result
 * is served from the `"nav"`-tagged cache. Call it from a module's segment
 * layout (e.g. `(portal)/maintenance/layout.tsx`) with the section `code`.
 *
 * Denied users are redirected to `/` (the home landing), not shown a 403
 * page: the section simply doesn't exist for them.
 */
export async function requireSectionOrRedirect(code: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.userId) redirect("/login");

  const roles = session.user.roles ?? [];
  const isAdmin = roles.includes("admin");
  const sections = await getCachedNav(navRoleKey(roles), isAdmin);

  if (!sections.some((s) => s.code === code)) {
    redirect("/");
  }
}
