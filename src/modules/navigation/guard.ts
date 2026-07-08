import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCachedNav, getCachedNavRegistry, navRoleKey } from "./cache";
import type { ResolvedNavItem } from "./db";

/**
 * Page-level authorization for a portal module (ADR 0008, supersedes 0005).
 * Navigation authority moved from the *section* to the individual *page*
 * (`nav_item`, V16 `role_nav_item`): a user may reach a route only if the page
 * that owns it resolves visible for them — *what is shown = what is reachable*,
 * now at page granularity. A section still gates its whole subtree (if the
 * section isn't visible, none of its pages are), and a section is itself
 * derived-visible only when ≥1 of its pages is.
 *
 * Resolution reuses `getCachedNav` (per-role visible tree) plus
 * `getCachedNavRegistry` (all registered active hrefs), both `"nav"`-tagged.
 * The `admin` role bypasses. The current path comes from the `x-pathname`
 * header injected by the middleware (Next.js layouts don't receive the
 * pathname on the server).
 *
 * Rule, given the caller's section `code`:
 *  - Section not visible → redirect `/`.
 *  - Path matches a **registered** active item (exact or nested under its
 *    `href`) that the role can't see → redirect `/`.
 *  - Path matches no registered item (e.g. a detail route with no nav entry) →
 *    it inherits the section grant (already visible) → allow.
 *
 * Denied users are redirected to `/` (home), not shown a 403.
 */
export async function requireSectionOrRedirect(code: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.userId) redirect("/login");

  const roles = session.user.roles ?? [];
  if (roles.includes("admin")) return; // admin sees/reaches everything

  const [nav, registry, hdrs] = await Promise.all([
    getCachedNav(navRoleKey(roles), false),
    getCachedNavRegistry(),
    headers(),
  ]);

  // Section-level gate first (a hidden section hides its whole subtree).
  if (!nav.some((s) => s.code === code)) redirect("/");

  const pathname = hdrs.get("x-pathname") ?? "";
  if (!pathname) return; // no path info: section gate already passed

  // Longest-prefix match against the registered active items.
  let matched: { item_id: number; href: string } | null = null;
  for (const it of registry.items) {
    if (pathname === it.href || pathname.startsWith(it.href + "/")) {
      if (!matched || it.href.length > matched.href.length) matched = it;
    }
  }
  if (!matched) return; // not a registered page → inherits section visibility

  const visible = new Set<number>();
  for (const s of nav) collectItemIds(s.items, visible);
  if (!visible.has(matched.item_id)) redirect("/");
}

function collectItemIds(items: ResolvedNavItem[], into: Set<number>): void {
  for (const it of items) {
    into.add(it.item_id);
    if (it.children.length > 0) collectItemIds(it.children, into);
  }
}
