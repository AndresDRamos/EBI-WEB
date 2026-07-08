/**
 * Enum domains of the `production` schema (V11, renamed by V12) — mirror the
 * constraints in migrations V11/V13 and must stay in sync with them. Pure
 * module (no I/O, no server-only) so both API validation and client UI import
 * the same source. Codes are stored in English; labels are the Spanish UI text.
 *
 * NOTE: `asset_category` used to live here as a fixed CHECK enum. As of V17
 * (plan equipment-maintenance-attributes) it is a configurable catalog
 * (`maint.asset_category`) owned by the maintenance module; there is no static
 * asset-category enum anymore.
 */

// --- plant layout (V13) ------------------------------------------------------

export const LAYOUT_STATUSES = ["draft", "active", "archived"] as const;
export type LayoutStatus = (typeof LAYOUT_STATUSES)[number];

export const LAYOUT_STATUS_LABELS: Record<LayoutStatus, string> = {
  draft: "Borrador",
  active: "Activo",
  archived: "Archivado",
};

export function layoutStatusLabel(code: string): string {
  return (LAYOUT_STATUS_LABELS as Record<string, string>)[code] ?? code;
}

export const FOOTPRINT_SOURCE_KINDS = ["dxf", "rectangle"] as const;
export type FootprintSourceKind = (typeof FOOTPRINT_SOURCE_KINDS)[number];
