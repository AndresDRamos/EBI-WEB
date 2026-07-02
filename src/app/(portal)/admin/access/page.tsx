import { Lock } from "lucide-react";
import { listSections, listItems } from "@/lib/db/nav";
import { listRoles } from "@/lib/db/org";
import { NavSectionsTablePage } from "@/components/admin/nav-sections-table-page";
import { NavItemsPanel } from "@/components/admin/nav-items-panel";
import { NavGrantsPanel } from "@/components/admin/nav-grants-panel";

export const dynamic = "force-dynamic";

/**
 * Configuración de accesos a módulos — the real screen (plan 0005) for the
 * nav registry: edit topbar sections (label/icon/order/active — routes are
 * seeded by module migrations, not created here), manage per-section sidebar
 * items, and set role → section grants with topbar priority.
 */
export default async function AdminAccessPage() {
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
      <header className="flex items-center gap-3">
        <Lock className="h-6 w-6 text-ezi-orange" />
        <div>
          <h1 className="text-2xl font-bold">Configuración de accesos a módulos</h1>
          <p className="text-sm text-muted-foreground">
            Secciones del topbar, ítems del sidebar y visibilidad por rol.
          </p>
        </div>
      </header>

      <NavSectionsTablePage sections={sections} />
      <NavItemsPanel sections={sectionOptions} items={items} />
      <NavGrantsPanel
        sections={sectionOptions}
        roles={roles.map((r) => ({ role_id: r.role_id, name: r.name }))}
      />
    </div>
  );
}
