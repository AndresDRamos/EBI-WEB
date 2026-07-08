import type { PageTab } from "@/components/kit/page-tabs";

/** Tabs of the machines area: the cards catalog and the Categoría→Tipos
 * configuration (plan equipment-maintenance-attributes). Shared by both pages
 * so the set stays consistent; the `[code]` detail keeps no tabs (it has its
 * own back-header, and the printable label must stay chrome-free). */
export const MACHINES_TABS: PageTab[] = [
  { href: "/maintenance/machines", label: "Equipos" },
  { href: "/maintenance/machines/catalogs", label: "Catálogos" },
];
