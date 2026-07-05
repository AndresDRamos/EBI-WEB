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

export const ASSET_CRITICALITIES = ["A", "B", "C"] as const;
export type AssetCriticality = (typeof ASSET_CRITICALITIES)[number];

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

// `asset_category` mirrors CK_asset_asset_category on maint.asset (V11, plan
// production-cell-assignment). The canonical domain lives in the production
// module (whose migration introduced the CHECK); re-exported here so
// maintenance UI/API keep one import site. Import direction maintenance →
// production matches the justified one-way dependency (Ubicación tab).
export {
  ASSET_CATEGORIES,
  ASSET_CATEGORY_LABELS,
  assetCategoryLabel,
  type AssetCategory,
} from "@/modules/production/enums";

export function statusLabel(code: string): string {
  return (ASSET_STATUS_LABELS as Record<string, string>)[code] ?? code;
}

export function restrictionTypeLabel(code: string): string {
  return (RESTRICTION_TYPE_LABELS as Record<string, string>)[code] ?? code;
}

export function docTypeLabel(code: string): string {
  return (DOC_TYPE_LABELS as Record<string, string>)[code] ?? code;
}
