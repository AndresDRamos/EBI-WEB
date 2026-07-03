import type { ResolvedNavSection } from "@/modules/navigation/db";

/**
 * The Administración panel's sidebar, expressed as a code-built
 * `ResolvedNavSection` so the panel reuses the same `PortalSidebar` as the
 * rest of the portal (plan 0007) instead of a bespoke rail. It is NOT in the
 * DB nav registry — `/admin/*` is gated by `assertAdminOrRedirect`, not by a
 * section grant — so the ids are synthetic negatives to never collide with
 * real `nav_section`/`nav_item` rows. Icons must exist in the curated
 * `NavIcon` map (`src/modules/navigation/icons.tsx`).
 *
 * Keep the entries reconciled with the real pages under `src/app/(portal)/admin/`.
 */
export const ADMIN_NAV_SECTION: ResolvedNavSection = {
  section_id: -1,
  code: "__admin",
  label: "Administración",
  icon: "ShieldCheck",
  base_path: "/admin",
  is_active: true,
  items: [
    { item_id: -1, label: "Organización", icon: "Building2", href: "/admin/organization", children: [] },
    { item_id: -2, label: "Portal", icon: "Lock", href: "/admin/portal", children: [] },
  ],
};
