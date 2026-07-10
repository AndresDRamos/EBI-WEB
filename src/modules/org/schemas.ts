import { z } from "zod";

/** POST /api/departments body. */
export const createDepartmentSchema = z.object({
  name: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : ""),
    z.string().min(1, "El nombre es obligatorio."),
  ),
  description: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : null),
    z.string().nullable(),
  ),
});

/** An omitted or blank-string field resolves to `undefined` (no change). */
const trimmedNameOrUndefined = z.preprocess((v) => {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed ? trimmed : undefined;
}, z.string().optional());

/** `null` clears the field; an omitted or blank-string field resolves to
 * `undefined` (no change); anything else (a non-blank string) is trimmed. */
const nullableTrimmedOrUndefined = z.preprocess((v) => {
  if (v === null) return null;
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}, z.string().nullable().optional());

/**
 * PUT /api/departments/[id] body. A partial update: an omitted or blank
 * string field leaves the column untouched, `null` clears `description`. At
 * least one field must be present.
 */
export const updateDepartmentSchema = z
  .object({
    name: trimmedNameOrUndefined,
    description: nullableTrimmedOrUndefined,
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "Sin cambios.",
  });

/**
 * POST /api/plants body. Reproduces the original imperative validation:
 * `code` and `name` are required (single combined message); `address` and
 * `postal_code` are optional, blank strings collapsing to `null`.
 */
export const createPlantSchema = z
  .object({
    code: z.unknown(),
    name: z.unknown(),
    address: z.unknown().optional(),
    postal_code: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    const code = typeof data.code === "string" ? data.code.trim() : "";
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (!code || !name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Código y nombre son obligatorios." });
    }
  })
  .transform((data) => ({
    code: typeof data.code === "string" ? data.code.trim() : "",
    name: typeof data.name === "string" ? data.name.trim() : "",
    address:
      typeof data.address === "string" && data.address.trim() ? data.address.trim() : null,
    postal_code:
      typeof data.postal_code === "string" && data.postal_code.trim()
        ? data.postal_code.trim()
        : null,
  }));

/**
 * PUT /api/plants/[id] body. A partial update: an omitted or blank string
 * field leaves the column untouched, `null` clears `address`/`postal_code`.
 * At least one field must be present.
 */
export const updatePlantSchema = z
  .object({
    code: trimmedNameOrUndefined,
    name: trimmedNameOrUndefined,
    address: nullableTrimmedOrUndefined,
    postal_code: nullableTrimmedOrUndefined,
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "Sin cambios.",
  });

/**
 * POST /api/org/locations body. `plant_id`, `code` and `name` are all
 * required (single combined message, matching the original handler).
 */
export const createLocationSchema = z
  .object({
    plant_id: z.unknown(),
    code: z.unknown(),
    name: z.unknown(),
  })
  .superRefine((data, ctx) => {
    const plantId = Number(data.plant_id);
    const code = typeof data.code === "string" ? data.code.trim() : "";
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (!Number.isInteger(plantId) || plantId <= 0 || !code || !name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Planta, código y nombre son obligatorios.",
      });
    }
  })
  .transform((data) => ({
    plant_id: Number(data.plant_id),
    code: typeof data.code === "string" ? data.code.trim() : "",
    name: typeof data.name === "string" ? data.name.trim() : "",
  }));

/**
 * PUT /api/org/locations/[id] body. A partial update: an omitted or blank
 * string field leaves the column untouched. At least one field must be
 * present.
 */
export const updateLocationSchema = z
  .object({
    code: trimmedNameOrUndefined,
    name: trimmedNameOrUndefined,
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "Sin cambios.",
  });

/**
 * POST /api/org/processes body. `code` and `name` are required (single
 * combined message); `description` is optional, a blank string collapsing to
 * `null`.
 */
export const createProcessSchema = z
  .object({
    code: z.unknown(),
    name: z.unknown(),
    description: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    const code = typeof data.code === "string" ? data.code.trim() : "";
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (!code || !name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Código y nombre son obligatorios." });
    }
  })
  .transform((data) => ({
    code: typeof data.code === "string" ? data.code.trim() : "",
    name: typeof data.name === "string" ? data.name.trim() : "",
    description:
      typeof data.description === "string" && data.description.trim()
        ? data.description.trim()
        : null,
  }));

/**
 * PUT /api/org/processes/[id] body. A partial update: an omitted or blank
 * string field leaves the column untouched, `null` clears `description`. At
 * least one field must be present.
 */
export const updateProcessSchema = z
  .object({
    code: trimmedNameOrUndefined,
    name: trimmedNameOrUndefined,
    description: nullableTrimmedOrUndefined,
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "Sin cambios.",
  });

// ---------------------------------------------------------------------------
// Users / invitations / password change
// ---------------------------------------------------------------------------

/** Positive-int id array; a non-array (or missing) input becomes `[]` —
 *  never throws, mirrors the old hand-rolled `asIdArray`. */
const idArray = z.preprocess((v) => {
  if (!Array.isArray(v)) return [];
  return v.map(Number).filter((n) => Number.isInteger(n) && n > 0);
}, z.array(z.number().int().positive()));

/** Same as `idArray`, but a non-array input becomes `undefined` instead of
 *  `[]` so partial updates can distinguish "not sent" from "sent empty". */
const optionalIdArray = z.preprocess((v) => {
  if (!Array.isArray(v)) return undefined;
  return v.map(Number).filter((n) => Number.isInteger(n) && n > 0);
}, z.array(z.number().int().positive()).optional());

/** Boolean that defaults to `false` unless the raw value is literally `true`. */
const booleanDefaultFalse = z.preprocess((v) => v === true, z.boolean());

/** Boolean that defaults to `true` unless the raw value is literally `false`. */
const booleanDefaultTrueUnlessFalse = z.preprocess((v) => v !== false, z.boolean());

/** Boolean that stays `undefined` unless the raw value is already a boolean
 *  (used for partial-update fields that must not error on a wrong type). */
const optionalBoolean = z.preprocess(
  (v) => (typeof v === "boolean" ? v : undefined),
  z.boolean().optional(),
);

/** Three-state string field: `null` clears it, a non-empty trimmed string
 *  sets it, anything else (including an absent key) leaves it `undefined`. */
const optionalNullableTrimmed = z.preprocess((v) => {
  if (v === null) return null;
  if (typeof v === "string") return v.trim() || null;
  return undefined;
}, z.string().nullable().optional());

/** POST /api/users body. */
export const createUserSchema = z.object({
  username: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() : ""),
    z
      .string()
      .min(1, "El usuario es obligatorio.")
      .regex(/^[a-z0-9._-]{3,64}$/, "Usuario inválido (3-64 chars: a-z 0-9 . _ -)."),
  ),
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : null),
    z.string().nullable(),
  ),
  display_name: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : null),
    z.string().nullable(),
  ),
  all_plants: booleanDefaultFalse,
  role_ids: idArray,
  plant_ids: idArray,
  department_ids: idArray,
  invite: booleanDefaultTrueUnlessFalse,
});

/**
 * PATCH /api/users/[id] body. Every field is a partial-update field: an
 * absent or wrongly-typed key becomes `undefined` (no 422 — this mirrors the
 * original handler's lenient, non-validating merge). `invalidate_sessions`
 * is not persisted by `updateUserAssignments`; the route reads it separately.
 */
export const updateUserSchema = z.object({
  role_ids: optionalIdArray,
  plant_ids: optionalIdArray,
  department_ids: optionalIdArray,
  all_plants: optionalBoolean,
  is_active: optionalBoolean,
  email: optionalNullableTrimmed,
  display_name: optionalNullableTrimmed,
  invalidate_sessions: booleanDefaultFalse,
});

/** POST /api/profile/password body — self-service password change. */
export const changePasswordSchema = z
  .object({
    current_password: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string()),
    new_password: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string()),
  })
  .superRefine((data, ctx) => {
    if (!data.current_password || !data.new_password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Debes enviar la contraseña actual y la nueva.",
        path: ["current_password"],
      });
      return;
    }
    if (data.new_password.length < 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La nueva contraseña debe tener al menos 8 caracteres.",
        path: ["new_password"],
      });
    }
  });

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/** Shared `department_id` shape for role create: `null`/absent = cross-department
 * (like `admin`), otherwise a positive integer FK. */
const roleDepartmentId = z
  .preprocess(
    (v) => (v === null || v === undefined ? null : Number(v)),
    z.number().nullable(),
  )
  .refine((v) => v === null || (Number.isInteger(v) && v > 0), {
    message: "Departamento inválido.",
  });

/** Same `department_id` handling, but for the partial-update schema below:
 * "not provided" (`undefined`) is a distinct, valid, no-op state — unlike
 * create, where an absent value always resolves to `null`. */
const optionalRoleDepartmentId = z
  .preprocess(
    (v) => (v === undefined ? undefined : v === null ? null : Number(v)),
    z.number().nullable().optional(),
  )
  .refine((v) => v === undefined || v === null || (Number.isInteger(v) && v > 0), {
    message: "Departamento inválido.",
  });

/** POST /api/roles body. `department_id` scopes the profile to a department
 * (NULL = cross-department, like `admin`) — plan 0006 / ADR 0004. */
export const createRoleSchema = z.object({
  name: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : ""),
    z.string().min(1, "El nombre es obligatorio."),
  ),
  description: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : null),
    z.string().nullable(),
  ),
  department_id: roleDepartmentId,
});

/**
 * PUT /api/roles/[id] body — every field optional (partial update); a field
 * that's missing, blank, or wrong-typed resolves to `undefined` and is left
 * out of the change set, mirroring `updateRole`'s own per-field `!==
 * undefined` checks. `department_id: null` is a meaningful, explicit "clear
 * the department". Rejects an empty change set with the same "Sin cambios."
 * message the route used to return after building its own `changes` object.
 */
export const updateRoleSchema = z
  .object({
    name: trimmedNameOrUndefined,
    description: nullableTrimmedOrUndefined,
    is_active: optionalBoolean,
    department_id: optionalRoleDepartmentId,
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "Sin cambios.",
  });

/** PUT /api/roles/[id]/permissions body — full permission-id grant set for a profile. */
export const rolePermissionsSchema = z.object({
  permission_ids: z.array(
    z.preprocess((v) => Number(v), z.number().int().positive()),
    { message: "Formato de permisos inválido." },
  ),
});

// ---------------------------------------------------------------------------
// Plant-process assignment
// ---------------------------------------------------------------------------

/**
 * PUT /api/org/plant-process/[plantId] body. `process_ids` must be an array
 * (a non-array is a 422, matching the legacy handler); entries that aren't
 * positive integers are silently dropped rather than rejected, same as
 * before.
 */
export const plantProcessSchema = z
  .object({ process_ids: z.unknown() })
  .transform((raw, ctx) => {
    if (!Array.isArray(raw.process_ids)) {
      ctx.addIssue({ code: "custom", message: "process_ids debe ser un arreglo de enteros." });
      return z.NEVER;
    }
    const process_ids = raw.process_ids.filter(
      (v): v is number => Number.isInteger(v) && (v as number) > 0,
    );
    return { process_ids };
  });
