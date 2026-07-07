/**
 * Enum domains of the `production` schema (V11, renamed by V12) and the
 * production-related CHECK on
 * `maint.asset` — mirror the constraints in migration V11 and must stay in
 * sync with them. Pure module (no I/O, no server-only) so both API validation
 * and client UI import the same source. Codes are stored in English; labels
 * are the Spanish UI text.
 */

export const ASSET_CATEGORIES = [
  "production_equipment",
  "material_handling",
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  production_equipment: "Equipo de producción",
  material_handling: "Manejo de materiales",
};

export function assetCategoryLabel(code: string): string {
  return (ASSET_CATEGORY_LABELS as Record<string, string>)[code] ?? code;
}

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
