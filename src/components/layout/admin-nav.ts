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
    { item_id: -1, label: "Usuarios", icon: "Users", href: "/admin/users", children: [] },
    { item_id: -2, label: "Perfiles de acceso", icon: "ShieldCheck", href: "/admin/roles", children: [] },
    { item_id: -3, label: "Plantas", icon: "Factory", href: "/admin/plants", children: [] },
    { item_id: -4, label: "Departamentos", icon: "Building2", href: "/admin/departments", children: [] },
    { item_id: -5, label: "Accesos a módulos", icon: "Lock", href: "/admin/access", children: [] },
    { item_id: -6, label: "Permisos por acción", icon: "KeyRound", href: "/admin/permissions", children: [] },
  ],
};
