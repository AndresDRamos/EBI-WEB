import { z } from "zod";

const positiveIntOrNull = (message: string) =>
  z
    .preprocess((v) => (v == null ? null : Number(v)), z.number().nullable())
    .refine((v) => v === null || (Number.isInteger(v) && v > 0), { message });

const positiveNumberOrNull = (message: string) =>
  z
    .preprocess((v) => (v == null || v === "" ? null : Number(v)), z.number().nullable())
    .refine((v) => v === null || (Number.isFinite(v) && v > 0), { message });

const trimmedNameOrUndefined = z.preprocess((v) => {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed ? trimmed : undefined;
}, z.string().optional());

/**
 * PATCH /api/production/cells/[id] body. A partial update: an omitted field
 * leaves the column untouched, `null` (where allowed) clears it. At least one
 * field must be present.
 */
export const updateCellSchema = z
  .object({
    name: trimmedNameOrUndefined,
    parent_cell_id: positiveIntOrNull("Celda padre inválida.").optional(),
    size_x_m: positiveNumberOrNull("El tamaño X debe ser mayor a cero.").optional(),
    size_y_m: positiveNumberOrNull("El tamaño Y debe ser mayor a cero.").optional(),
    process_id: positiveIntOrNull("Proceso inválido.").optional(),
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "Sin cambios.",
  });

/**
 * POST /api/production/layouts/[id]/placements body. Reproduces the original
 * imperative validation exactly, in order: `asset_id` first, then `x_m`/`y_m`
 * together (shared message), then `rotation_deg` (defaults to 0 when
 * omitted/null). `note` passes through untouched when a string, `null`
 * otherwise (no validation error, matching the original).
 */
export const createPlacementSchema = z
  .object({
    asset_id: z.unknown(),
    x_m: z.unknown(),
    y_m: z.unknown(),
    rotation_deg: z.unknown().optional(),
    note: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    const assetId = Number(data.asset_id);
    if (!Number.isInteger(assetId) || assetId <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Equipo inválido." });
      return;
    }
    const x = Number(data.x_m);
    const y = Number(data.y_m);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Posición inválida." });
      return;
    }
    const rotation = data.rotation_deg == null ? 0 : Number(data.rotation_deg);
    if (!Number.isFinite(rotation) || rotation < 0 || rotation >= 360) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Rotación inválida (0 ≤ grados < 360).",
      });
    }
  })
  .transform((data) => ({
    asset_id: Number(data.asset_id),
    x_m: Number(data.x_m),
    y_m: Number(data.y_m),
    rotation_deg: data.rotation_deg == null ? 0 : Number(data.rotation_deg),
    note: typeof data.note === "string" ? data.note : null,
  }));

function parsePositiveNumberOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : (NaN as unknown as null);
}

/**
 * POST /api/production/cells body. `code` is never accepted here — it is
 * auto-generated server-side from `location_id` + sequence. Reproduces the
 * original imperative checks in order: name+location together, then parent,
 * then size X/Y (NaN before null, matching the original branch order), then
 * process.
 */
export const createCellSchema = z
  .object({
    name: z.unknown(),
    location_id: z.unknown(),
    parent_cell_id: z.unknown().optional(),
    size_x_m: z.unknown().optional(),
    size_y_m: z.unknown().optional(),
    process_id: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const locationId = Number(data.location_id);
    if (!name || !Number.isInteger(locationId) || locationId <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Nombre y ubicación son obligatorios." });
      return;
    }
    const parentId = data.parent_cell_id == null ? null : Number(data.parent_cell_id);
    if (parentId !== null && (!Number.isInteger(parentId) || parentId <= 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Celda padre inválida." });
      return;
    }
    const sizeX = parsePositiveNumberOrNull(data.size_x_m);
    const sizeY = parsePositiveNumberOrNull(data.size_y_m);
    if (Number.isNaN(sizeX) || Number.isNaN(sizeY)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El tamaño debe ser mayor a cero." });
      return;
    }
    if (sizeX === null || sizeY === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El tamaño X y Y es obligatorio." });
      return;
    }
    const processId = data.process_id == null ? null : Number(data.process_id);
    if (processId !== null && (!Number.isInteger(processId) || processId <= 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Proceso inválido." });
    }
  })
  .transform((data) => ({
    name: typeof data.name === "string" ? data.name.trim() : "",
    location_id: Number(data.location_id),
    parent_cell_id: data.parent_cell_id == null ? null : Number(data.parent_cell_id),
    size_x_m: parsePositiveNumberOrNull(data.size_x_m) as number,
    size_y_m: parsePositiveNumberOrNull(data.size_y_m) as number,
    process_id: data.process_id == null ? null : Number(data.process_id),
  }));

/**
 * POST /api/production/cells/[id]/assignments body — assign an asset to a
 * cell. `role_label`/`note` are free-form and pass through untouched when
 * they are strings, `null` otherwise (no validation error, matching the
 * original).
 */
export const assignAssetSchema = z
  .object({
    asset_id: z.unknown(),
    role_label: z.unknown().optional(),
    valid_from: z.unknown().optional(),
    note: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    const assetId = Number(data.asset_id);
    if (!Number.isInteger(assetId) || assetId <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Equipo inválido." });
      return;
    }
    if (data.valid_from != null && data.valid_from !== "") {
      if (typeof data.valid_from !== "string") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Fecha inválida." });
        return;
      }
      const d = new Date(data.valid_from);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Fecha inválida." });
      }
    }
  })
  .transform((data) => {
    let validFrom: Date | null = null;
    if (data.valid_from != null && data.valid_from !== "") {
      validFrom = new Date(data.valid_from as string);
    }
    return {
      asset_id: Number(data.asset_id),
      role_label: typeof data.role_label === "string" ? data.role_label : null,
      valid_from: validFrom,
      note: typeof data.note === "string" ? data.note : null,
    };
  });

/**
 * POST /api/production/cells/[id]/children/reorder body — the new Op10/
 * Op20… order. Values must be numbers (not numeric strings), matching the
 * original strict `typeof v === "number"` check; the db layer re-validates
 * it is exactly the parent's current children.
 */
export const reorderCellChildrenSchema = z.object({
  ordered_cell_ids: z
    .unknown()
    .refine(
      (v): v is number[] =>
        Array.isArray(v) &&
        v.length > 0 &&
        v.every((x) => typeof x === "number" && Number.isInteger(x) && x > 0),
      { message: "Lista de celdas inválida." },
    ),
});

/**
 * POST /api/production/assignments/[id]/reassign body — historized move to
 * a new cell. `role_label`/`note` pass through untouched when strings, `null`
 * otherwise.
 */
export const reassignAssignmentSchema = z
  .object({
    to_cell_id: z.unknown(),
    role_label: z.unknown().optional(),
    note: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    const toCellId = Number(data.to_cell_id);
    if (!Number.isInteger(toCellId) || toCellId <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Celda destino inválida." });
    }
  })
  .transform((data) => ({
    to_cell_id: Number(data.to_cell_id),
    role_label: typeof data.role_label === "string" ? data.role_label : null,
    note: typeof data.note === "string" ? data.note : null,
  }));

/**
 * PUT /api/production/footprints/[assetId] JSON body — W×D rectangle
 * quick-create path (the multipart/DXF path never reaches this schema; it is
 * parsed manually as `FormData` in the route).
 */
export const rectangleFootprintSchema = z
  .object({
    source_kind: z.unknown(),
    width_m: z.unknown(),
    depth_m: z.unknown(),
  })
  .superRefine((data, ctx) => {
    if (data.source_kind !== "rectangle") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "source_kind debe ser 'rectangle' (o envía un DXF multipart).",
      });
      return;
    }
    const width = Number(data.width_m);
    const depth = Number(data.depth_m);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(depth) ||
      width <= 0 ||
      depth <= 0 ||
      width > 100 ||
      depth > 100
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Dimensiones inválidas (0 < metros ≤ 100).",
      });
    }
  })
  .transform((data) => ({
    width_m: Number(data.width_m),
    depth_m: Number(data.depth_m),
  }));

/**
 * POST /api/production/placements/[id]/move body — historized reposition.
 * `rotation_deg` defaults to 0 when omitted; `note` passes through untouched
 * when a string, `null` otherwise.
 */
export const movePlacementSchema = z
  .object({
    x_m: z.unknown(),
    y_m: z.unknown(),
    rotation_deg: z.unknown().optional(),
    note: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    const x = Number(data.x_m);
    const y = Number(data.y_m);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Posición inválida." });
      return;
    }
    const rotation = data.rotation_deg == null ? 0 : Number(data.rotation_deg);
    if (!Number.isFinite(rotation) || rotation < 0 || rotation >= 360) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Rotación inválida (0 ≤ grados < 360).",
      });
    }
  })
  .transform((data) => ({
    x_m: Number(data.x_m),
    y_m: Number(data.y_m),
    rotation_deg: data.rotation_deg == null ? 0 : Number(data.rotation_deg),
    note: typeof data.note === "string" ? data.note : null,
  }));
