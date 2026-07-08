/**
 * Enum domains of the `maint` schema — mirror the CHECK constraints in
 * migrations V5/V6 and must stay in sync with them. Pure module (no I/O, no
 * server-only) so both API validation and client UI import the same source.
 * Codes are stored in English; labels are the Spanish UI text.
 */

export const ASSET_STATUSES = ["active", "in_repair", "standby", "retired"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  active: "Operativo",
  in_repair: "En reparación",
  standby: "En espera",
  retired: "Retirado",
};

// `criticality` (char 1, CHECK A/B/C) stays on `maint.asset` but is no longer
// captured or shown by the app (plan equipment-maintenance-attributes) — no
// enum constant here since nothing validates or displays it anymore.

export const RESTRICTION_TYPES = ["limitation", "safety", "operational"] as const;
export type RestrictionType = (typeof RESTRICTION_TYPES)[number];

export const RESTRICTION_TYPE_LABELS: Record<RestrictionType, string> = {
  limitation: "Limitación",
  safety: "Seguridad",
  operational: "Operativa",
};

export const DOC_TYPES = [
  "manual",
  "electrical_diagram",
  "pneumatic_diagram",
  "dxf_topview",
  "photo",
  "other",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  manual: "Manual",
  electrical_diagram: "Diagrama eléctrico",
  pneumatic_diagram: "Diagrama neumático",
  dxf_topview: "DXF top-view",
  photo: "Fotografía",
  other: "Otro",
};

// `asset_category` is no longer a fixed enum. As of V17 (plan
// equipment-maintenance-attributes) it is a configurable catalog
// (`maint.asset_category`) plus its child `maint.asset_type`; an asset carries
// an `asset_type_id` and its category is derived via the type. Category/type
// labels come from the DB (see `listAssetCategories`/`listAssetTypes` in
// `db.ts`), not from a static map here.

export function statusLabel(code: string): string {
  return (ASSET_STATUS_LABELS as Record<string, string>)[code] ?? code;
}

export function restrictionTypeLabel(code: string): string {
  return (RESTRICTION_TYPE_LABELS as Record<string, string>)[code] ?? code;
}

export function docTypeLabel(code: string): string {
  return (DOC_TYPE_LABELS as Record<string, string>)[code] ?? code;
}
