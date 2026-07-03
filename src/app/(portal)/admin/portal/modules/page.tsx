import { listSections, listItems } from "@/modules/navigation/db";
import { listRoles } from "@/modules/org/db/org";
import { NavSectionsTablePage } from "@/modules/navigation/components/nav-sections-table-page";
import { NavItemsPanel } from "@/modules/navigation/components/nav-items-panel";
import { NavGrantsPanel } from "@/modules/navigation/components/nav-grants-panel";

export const dynamic = "force-dynamic";

/**
 * Módulos tab (Portal) — the nav registry: edit topbar sections (label/icon/
 * order/active — routes are seeded by module migrations, not created here),
 * manage per-section sidebar items, and set role → section grants with topbar
 * priority. Phase 2 (module tree with department/role grants) will replace
 * these panels.
 */
export default async function AdminModulesPage() {
  const [sections, items, roles] = await Promise.all([
    listSections().catch(() => []),
    listItems().catch(() => []),
    listRoles(true).catch(() => []),
  ]);

  const sectionOptions = sections.map((s) => ({
    section_id: s.section_id,
    label: s.label,
    base_path: s.base_path,
  }));

  return (
    <div className="space-y-6">
      <NavSectionsTablePage sections={sections} />
      <NavItemsPanel sections={sectionOptions} items={items} />
      <NavGrantsPanel
        sections={sectionOptions}
        roles={roles.map((r) => ({ role_id: r.role_id, name: r.name }))}
      />
    </div>
  );
}
