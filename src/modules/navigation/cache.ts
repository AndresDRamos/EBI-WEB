import "server-only";
import { unstable_cache } from "next/cache";
import {
  getNavForUser,
  listActiveItemRefs,
  listSectionRefs,
  type NavItemRef,
  type NavSectionRef,
  type ResolvedNavSection,
} from "./db";

/**
 * Cached nav resolution shared by the portal layout (shell render), the home
 * page (`/`) and the per-section route guard (`requireSectionOrRedirect`).
 *
 * Nav tables are tiny (<10 sections, <100 items, <200 grants — see the V7 dba
 * review) but resolving them on every render/guard is one query too many.
 * Cache per role-set, invalidated by `revalidateTag("nav")` from every
 * `/api/navigation/nav/*` mutation. `roleKey` is the caller's sorted, comma-joined role
 * names so the cache key is stable across requests with the same access.
 */
export const getCachedNav = unstable_cache(
  async (roleKey: string, isAdmin: boolean): Promise<ResolvedNavSection[]> =>
    getNavForUser(roleKey ? roleKey.split(",") : [], isAdmin),
  ["portal-nav"],
  { tags: ["nav"] },
);

/** Stable cache key for a user's role set: sorted + comma-joined. */
export function navRoleKey(roles: string[]): string {
  return [...roles].sort().join(",");
}

/**
 * Role-independent nav registry (all active item hrefs + all section refs),
 * cached under the same `"nav"` tag. The page-level guard (ADR 0008) uses it to
 * tell "this path maps to a registered page the role can't see" (→ deny) apart
 * from "this path isn't a registered nav item" (→ inherits section visibility).
 */
export const getCachedNavRegistry = unstable_cache(
  async (): Promise<{ items: NavItemRef[]; sections: NavSectionRef[] }> => {
    const [items, sections] = await Promise.all([listActiveItemRefs(), listSectionRefs()]);
    return { items, sections };
  },
  ["portal-nav-registry"],
  { tags: ["nav"] },
);
