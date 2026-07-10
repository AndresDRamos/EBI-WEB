import { z } from "zod";
import { NAV_ICON_NAMES } from "@/modules/navigation/icons";

const INVALID_GRANTS = "Formato de visibilidad inválido.";

const grantEntry = z.object({
  item_id: z.preprocess((v) => Number(v), z.number().int().positive()),
  priority: z.preprocess((v) => Number(v), z.number().int()),
});

/** PUT /api/roles/[id]/items and /api/roles/[id]/sections body (shared shape). */
export const roleGrantsSchema = z.object({
  grants: z.array(grantEntry, { message: INVALID_GRANTS }),
});

const INVALID_ROLE_SECTION_GRANTS = "Formato de accesos inválido.";

const roleSectionGrantEntry = z.object({
  section_id: z.preprocess((v) => Number(v), z.number().int().positive()),
  priority: z.preprocess((v) => Number(v), z.number().int()),
});

/**
 * PUT /api/roles/[id]/sections body. Structurally parallel to
 * `roleGrantsSchema` (same shape, `section_id` instead of `item_id`) — kept
 * as its own schema rather than reused, since `sections/route.ts` is still a
 * near-duplicate sibling of `items/route.ts` pending a future grants-handler
 * collapse; merging the schemas now would make that later refactor harder to
 * review, not easier. Not to be confused with `sectionGrantsSchema` below,
 * which is the role-centric/item-centric dual for a different route
 * (`/api/nav/sections/[id]/grants`).
 */
export const roleSectionGrantsSchema = z.object({
  grants: z.array(roleSectionGrantEntry, { message: INVALID_ROLE_SECTION_GRANTS }),
});

const sectionGrantEntry = z.object({
  role_id: z.preprocess((v) => Number(v), z.number().int().positive()),
  priority: z.preprocess((v) => Number(v), z.number().int()),
});

/**
 * PUT /api/nav/sections/[id]/grants body — role-centric axis (dual of
 * `roleGrantsSchema`, which is item-centric). Validated manually with
 * `badRequest` (400) in the route, not via `parseBody`'s schema arg: the
 * legacy handler used 400 for a malformed grants array, not 422.
 */
export const sectionGrantsSchema = z.object({
  grants: z.array(sectionGrantEntry),
});

/**
 * POST /api/nav/items body. `href` must live under the target section's
 * `base_path`, but that's a cross-row rule checked against the DB inside the
 * route handler (after the permission guard) — not expressible here.
 */
export const createNavItemSchema = z
  .object({
    section_id: z.unknown(),
    parent_item_id: z.unknown().optional(),
    label: z.unknown(),
    icon: z.unknown().optional(),
    href: z.unknown(),
    sort_order: z.unknown().optional(),
  })
  .transform((raw, ctx) => {
    const sectionId = Number(raw.section_id);
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    const href = typeof raw.href === "string" ? raw.href.trim() : "";
    if (!Number.isInteger(sectionId) || sectionId <= 0 || !label || !href) {
      ctx.addIssue({ code: "custom", message: "Sección, etiqueta y ruta son obligatorias." });
      return z.NEVER;
    }
    let icon: string | null = null;
    if (raw.icon !== undefined && raw.icon !== null) {
      if (typeof raw.icon !== "string" || !(NAV_ICON_NAMES as readonly string[]).includes(raw.icon)) {
        ctx.addIssue({ code: "custom", message: "Ícono no reconocido." });
        return z.NEVER;
      }
      icon = raw.icon;
    }
    let parentItemId: number | null = null;
    if (raw.parent_item_id !== null && raw.parent_item_id !== undefined) {
      parentItemId = Number(raw.parent_item_id);
      if (!Number.isInteger(parentItemId) || parentItemId <= 0) {
        ctx.addIssue({ code: "custom", message: "Ítem padre inválido." });
        return z.NEVER;
      }
    }
    const sortOrder =
      typeof raw.sort_order === "number" && Number.isInteger(raw.sort_order) ? raw.sort_order : 0;
    return {
      section_id: sectionId,
      parent_item_id: parentItemId,
      label,
      icon,
      href,
      sort_order: sortOrder,
    };
  });

/**
 * PUT /api/nav/items/[id] body — sparse partial update. Mirrors the legacy
 * handler's silent-skip semantics: a field with the wrong type is simply
 * omitted from the result rather than rejected (only an out-of-catalog
 * `icon` is a hard error). `href`'s section-`base_path` cross-check stays in
 * the route (needs the current row's `section_id` from the DB).
 */
export const updateNavItemSchema = z
  .object({
    label: z.unknown().optional(),
    icon: z.unknown().optional(),
    href: z.unknown().optional(),
    parent_item_id: z.unknown().optional(),
    sort_order: z.unknown().optional(),
    is_active: z.unknown().optional(),
  })
  .transform((raw, ctx) => {
    const changes: {
      label?: string;
      icon?: string | null;
      href?: string;
      parent_item_id?: number | null;
      sort_order?: number;
      is_active?: boolean;
    } = {};
    if (typeof raw.label === "string" && raw.label.trim()) changes.label = raw.label.trim();
    if (raw.icon === null) changes.icon = null;
    else if (typeof raw.icon === "string") {
      if (!(NAV_ICON_NAMES as readonly string[]).includes(raw.icon)) {
        ctx.addIssue({ code: "custom", message: "Ícono no reconocido." });
        return z.NEVER;
      }
      changes.icon = raw.icon;
    }
    if (typeof raw.href === "string" && raw.href.trim()) changes.href = raw.href.trim();
    if (raw.parent_item_id === null) changes.parent_item_id = null;
    else if (typeof raw.parent_item_id === "number") changes.parent_item_id = raw.parent_item_id;
    if (typeof raw.sort_order === "number" && Number.isInteger(raw.sort_order)) {
      changes.sort_order = raw.sort_order;
    }
    if (typeof raw.is_active === "boolean") changes.is_active = raw.is_active;
    return changes;
  });

/**
 * PUT /api/nav/sections/[id] body — same sparse partial-update semantics as
 * `updateNavItemSchema`. `base_path`/`code` are intentionally not accepted:
 * routes are owned by code, not the admin panel.
 */
export const updateNavSectionSchema = z
  .object({
    label: z.unknown().optional(),
    icon: z.unknown().optional(),
    sort_order: z.unknown().optional(),
    is_active: z.unknown().optional(),
  })
  .transform((raw, ctx) => {
    const changes: {
      label?: string;
      icon?: string | null;
      sort_order?: number;
      is_active?: boolean;
    } = {};
    if (typeof raw.label === "string" && raw.label.trim()) changes.label = raw.label.trim();
    if (raw.icon === null) changes.icon = null;
    else if (typeof raw.icon === "string") {
      if (!(NAV_ICON_NAMES as readonly string[]).includes(raw.icon)) {
        ctx.addIssue({ code: "custom", message: "Ícono no reconocido." });
        return z.NEVER;
      }
      changes.icon = raw.icon;
    }
    if (typeof raw.sort_order === "number" && Number.isInteger(raw.sort_order)) {
      changes.sort_order = raw.sort_order;
    }
    if (typeof raw.is_active === "boolean") changes.is_active = raw.is_active;
    return changes;
  });
