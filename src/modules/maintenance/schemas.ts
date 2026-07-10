import { z } from "zod";
import { RESTRICTION_TYPES } from "@/modules/maintenance/enums";

const trimmedNameOrUndefined = z.preprocess((v) => {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed ? trimmed : undefined;
}, z.string().optional());

const CODE_PREFIX_FORMAT = /^[A-Za-z0-9]{2,8}$/;
const CODE_PREFIX_MESSAGE =
  "El código debe tener de 2 a 8 caracteres alfanuméricos: también se usa como prefijo de matrícula.";

// ---------------------------------------------------------------------------
// Asset categories
// ---------------------------------------------------------------------------

/** POST /api/maintenance/asset-categories body. `code` and `name` are both
 * required (a single combined message, matching the original handler). */
export const createAssetCategorySchema = z
  .object({
    code: z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string()),
    name: z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string()),
  })
  .refine((data) => data.code !== "" && data.name !== "", {
    message: "Código y nombre son obligatorios.",
  });

/**
 * PUT /api/maintenance/asset-categories/[id] body. A partial update: an
 * omitted or blank string field leaves the column untouched. At least one
 * field must be present.
 */
export const updateAssetCategorySchema = z
  .object({
    code: trimmedNameOrUndefined,
    name: trimmedNameOrUndefined,
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "Sin cambios.",
  });

// ---------------------------------------------------------------------------
// Asset types
// ---------------------------------------------------------------------------

const positiveIntArray = (arr: unknown): arr is number[] =>
  Array.isArray(arr) && arr.every((p) => Number.isInteger(p) && (p as number) > 0);

/**
 * POST /api/maintenance/asset-types body. `code` is uppercased and doubles as
 * the matrícula prefix (V18), so it must satisfy `CODE_PREFIX_FORMAT`.
 * `process_ids`, when present, must be an array of positive ints.
 */
export const createAssetTypeSchema = z
  .object({
    asset_category_id: z.unknown(),
    code: z.unknown(),
    name: z.unknown(),
    /** Process links (N:M in DB; the UI sends 0 or 1 for now). */
    process_ids: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    const categoryId = Number(data.asset_category_id);
    const code = typeof data.code === "string" ? data.code.trim().toUpperCase() : "";
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (!Number.isInteger(categoryId) || categoryId <= 0 || !code || !name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Categoría, código y nombre son obligatorios.",
      });
      return;
    }
    if (!CODE_PREFIX_FORMAT.test(code)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: CODE_PREFIX_MESSAGE });
      return;
    }
    if (data.process_ids !== undefined && !positiveIntArray(data.process_ids)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Procesos inválidos." });
    }
  })
  .transform((data) => ({
    asset_category_id: Number(data.asset_category_id),
    code: (data.code as string).trim().toUpperCase(),
    name: (data.name as string).trim(),
    process_ids: (data.process_ids as number[] | undefined) ?? [],
  }));

/**
 * PUT /api/maintenance/asset-types/[id] body. A partial update: an omitted
 * field leaves the column/link untouched. `code_prefix` is not a separate
 * input — the route mirrors it from `code`. `process_ids`, when present,
 * fully replaces the type ↔ process links. At least one field (including
 * `process_ids`) must be present.
 */
export const updateAssetTypeSchema = z
  .object({
    asset_category_id: z.unknown().optional(),
    code: z.unknown().optional(),
    name: z.unknown().optional(),
    is_active: z.unknown().optional(),
    process_ids: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.asset_category_id !== undefined) {
      const categoryId = Number(data.asset_category_id);
      if (!Number.isInteger(categoryId) || categoryId <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Categoría inválida." });
        return;
      }
    }
    if (typeof data.code === "string" && data.code.trim()) {
      const code = data.code.trim().toUpperCase();
      if (!CODE_PREFIX_FORMAT.test(code)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: CODE_PREFIX_MESSAGE });
        return;
      }
    }
    if (data.process_ids !== undefined && !positiveIntArray(data.process_ids)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Procesos inválidos." });
      return;
    }
    const hasCode = typeof data.code === "string" && data.code.trim() !== "";
    const hasName = typeof data.name === "string" && data.name.trim() !== "";
    const hasIsActive = typeof data.is_active === "boolean";
    const hasCategory = data.asset_category_id !== undefined;
    const hasProcessIds = data.process_ids !== undefined;
    if (!hasCode && !hasName && !hasIsActive && !hasCategory && !hasProcessIds) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Sin cambios." });
    }
  })
  .transform((data) => {
    const out: {
      asset_category_id?: number;
      code?: string;
      name?: string;
      is_active?: boolean;
      process_ids?: number[];
    } = {};
    if (data.asset_category_id !== undefined) out.asset_category_id = Number(data.asset_category_id);
    if (typeof data.code === "string" && data.code.trim()) out.code = data.code.trim().toUpperCase();
    if (typeof data.name === "string" && data.name.trim()) out.name = data.name.trim();
    if (typeof data.is_active === "boolean") out.is_active = data.is_active;
    if (data.process_ids !== undefined) out.process_ids = data.process_ids as number[];
    return out;
  });

// ---------------------------------------------------------------------------
// Asset restrictions
// ---------------------------------------------------------------------------

const trimmedDescriptionOrUndefined = z.preprocess((v) => {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed ? trimmed : undefined;
}, z.string().optional());

const booleanOrUndefined = z.preprocess(
  (v) => (typeof v === "boolean" ? v : undefined),
  z.boolean().optional(),
);

/** POST /api/maintenance/assets/[id]/restrictions body. */
export const createRestrictionSchema = z.object({
  restriction_type: z.enum(RESTRICTION_TYPES, { message: "Tipo de restricción inválido." }),
  description: z.string().trim().min(1, "Descripción requerida."),
});

/**
 * PUT /api/maintenance/assets/[id]/restrictions/[restrictionId] body. A
 * partial update: an omitted or invalid-shaped `description`/`is_active` is
 * silently skipped (matches the original imperative validation), while an
 * invalid `restriction_type` is rejected. At least one field must resolve to
 * an actual change.
 */
export const updateRestrictionSchema = z
  .object({
    restriction_type: z
      .enum(RESTRICTION_TYPES, { message: "Tipo de restricción inválido." })
      .optional(),
    description: trimmedDescriptionOrUndefined,
    is_active: booleanOrUndefined,
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "Sin cambios.",
  });

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** null/absent → null; valid date string → Date; anything else → undefined (invalid). */
function parseDateOrNull(v: unknown): Date | null | undefined {
  if (v == null || v === "") return null;
  if (typeof v !== "string") return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export interface CreateAssetBody {
  name: string;
  location_id: number;
  asset_type_id: number;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  parent_asset_id: number | null;
  installation_date: Date | null;
  image_blob_path: string | null;
  notes: string | null;
}

/**
 * POST /api/maintenance/assets body. The matrícula (`code`) is auto-generated
 * server-side from the type's prefix + the location's plant; the client never
 * sends it, and `status` is not client-settable.
 */
export const createAssetSchema = z
  .object({
    name: z.unknown(),
    location_id: z.unknown(),
    asset_type_id: z.unknown(),
    brand: z.unknown().optional(),
    model: z.unknown().optional(),
    serial_number: z.unknown().optional(),
    parent_asset_id: z.unknown().optional(),
    installation_date: z.unknown().optional(),
    image_blob_path: z.unknown().optional(),
    notes: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const locationId = Number(data.location_id);
    const assetTypeId = Number(data.asset_type_id);
    if (!name || !Number.isInteger(locationId) || locationId <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Nombre y ubicación son obligatorios." });
      return;
    }
    if (!Number.isInteger(assetTypeId) || assetTypeId <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El tipo de equipo es obligatorio." });
      return;
    }
    const parentId = data.parent_asset_id == null ? null : Number(data.parent_asset_id);
    if (parentId !== null && (!Number.isInteger(parentId) || parentId <= 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Equipo padre inválido." });
      return;
    }
    if (parseDateOrNull(data.installation_date) === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Fecha de instalación inválida." });
    }
  })
  .transform(
    (data): CreateAssetBody => ({
      name: typeof data.name === "string" ? data.name.trim() : "",
      location_id: Number(data.location_id),
      asset_type_id: Number(data.asset_type_id),
      brand: strOrNull(data.brand),
      model: strOrNull(data.model),
      serial_number: strOrNull(data.serial_number),
      parent_asset_id: data.parent_asset_id == null ? null : Number(data.parent_asset_id),
      installation_date: parseDateOrNull(data.installation_date) ?? null,
      image_blob_path: strOrNull(data.image_blob_path),
      notes: strOrNull(data.notes),
    }),
  );

export interface UpdateAssetBody {
  name?: string;
  location_id?: number;
  asset_type_id?: number;
  brand?: string | null;
  model?: string | null;
  serial_number?: string | null;
  parent_asset_id?: number | null;
  installation_date?: Date | null;
  image_blob_path?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

/**
 * PATCH /api/maintenance/assets/[id] body. A partial update: an omitted field
 * leaves the column untouched, `null` (where allowed) clears it. `code`,
 * `status` and `plant_id` are not accepted (immutable / derived / not
 * user-settable). At least one recognized change must be present, and
 * `parent_asset_id` cannot equal the asset's own id — both checks need the
 * route's `id`, so this schema is a factory rather than a static constant.
 */
export function updateAssetSchema(id: number) {
  return z
    .object({
      name: z.unknown().optional(),
      location_id: z.unknown().optional(),
      asset_type_id: z.unknown().optional(),
      brand: z.unknown().optional(),
      model: z.unknown().optional(),
      serial_number: z.unknown().optional(),
      parent_asset_id: z.unknown().optional(),
      installation_date: z.unknown().optional(),
      image_blob_path: z.unknown().optional(),
      notes: z.unknown().optional(),
      is_active: z.unknown().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.location_id !== undefined) {
        const locationId = Number(data.location_id);
        if (!Number.isInteger(locationId) || locationId <= 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ubicación inválida." });
          return;
        }
      }
      if (data.asset_type_id !== undefined) {
        const typeId = Number(data.asset_type_id);
        if (!Number.isInteger(typeId) || typeId <= 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Tipo de equipo inválido." });
          return;
        }
      }
      if (data.parent_asset_id !== undefined) {
        const parentId = data.parent_asset_id == null ? null : Number(data.parent_asset_id);
        if (parentId !== null && (!Number.isInteger(parentId) || parentId <= 0 || parentId === id)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Equipo padre inválido." });
          return;
        }
      }
      if (data.installation_date !== undefined) {
        if (data.installation_date != null && data.installation_date !== "") {
          if (
            typeof data.installation_date !== "string" ||
            Number.isNaN(new Date(data.installation_date).getTime())
          ) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Fecha de instalación inválida." });
            return;
          }
        }
      }

      const hasName = typeof data.name === "string" && data.name.trim() !== "";
      const hasLocation = data.location_id !== undefined;
      const hasType = data.asset_type_id !== undefined;
      const hasSimpleField = (["brand", "model", "serial_number", "image_blob_path", "notes"] as const).some(
        (key) => {
          const v = data[key];
          return v === null || typeof v === "string";
        },
      );
      const hasParent = data.parent_asset_id !== undefined;
      const hasInstallationDate = data.installation_date !== undefined;
      const hasIsActive = typeof data.is_active === "boolean";
      if (
        !hasName &&
        !hasLocation &&
        !hasType &&
        !hasSimpleField &&
        !hasParent &&
        !hasInstallationDate &&
        !hasIsActive
      ) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Sin cambios." });
      }
    })
    .transform((data): UpdateAssetBody => {
      const changes: UpdateAssetBody = {};
      if (typeof data.name === "string" && data.name.trim()) changes.name = data.name.trim();
      if (data.location_id !== undefined) changes.location_id = Number(data.location_id);
      if (data.asset_type_id !== undefined) changes.asset_type_id = Number(data.asset_type_id);
      for (const key of ["brand", "model", "serial_number", "image_blob_path", "notes"] as const) {
        const v = data[key];
        if (v === null || typeof v === "string") {
          changes[key] = typeof v === "string" && v.trim() ? v.trim() : null;
        }
      }
      if (data.parent_asset_id !== undefined) {
        changes.parent_asset_id = data.parent_asset_id == null ? null : Number(data.parent_asset_id);
      }
      if (data.installation_date !== undefined) {
        changes.installation_date =
          data.installation_date == null || data.installation_date === ""
            ? null
            : new Date(data.installation_date as string);
      }
      if (typeof data.is_active === "boolean") changes.is_active = data.is_active;
      return changes;
    });
}
