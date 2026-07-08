import "server-only";
import { db as rootDb } from "@/lib/db/client";
import type { Selectable, Insertable } from "kysely";
import type { NavSection, NavItem } from "@/lib/db/types";

// Nav tables live in the `auth` schema (role-coupled). See the note in
// users.ts / org.ts: kysely-codegen flattens the schema out of the generated
// keys, so bind the client here or SQL Server resolves under dbo and 208s.
const db = rootDb.withSchema("auth");

export type NavSectionRow = Selectable<NavSection>;
export type NavItemRow = Selectable<NavItem>;

export interface ResolvedNavItem {
  item_id: number;
  label: string;
  icon: string | null;
  href: string;
  children: ResolvedNavItem[];
}

export interface ResolvedNavSection {
  section_id: number;
  code: string;
  label: string;
  icon: string | null;
  base_path: string;
  /** `false` only ever reaches admins: inactive sections stay invisible for
   * everyone else (grant resolution keeps its `is_active` filter). */
  is_active: boolean;
  items: ResolvedNavItem[];
}

/**
 * Resolve the topbar + sidebar nav for a user. Admins see EVERY section —
 * including inactive ones (rendered dimmed/"oculta" by the topbar), so the
 * portal map is never lost and dark-launched sections can be found and
 * reactivated. No grant rows needed (app-layer "sees all" rule — matches the
 * protected-role pattern in org.ts).
 *
 * Everyone else: navigation authorization is **per page** (ADR 0008, V16
 * `role_nav_item`). A user sees an active item only if one of their roles has a
 * `role_nav_item` grant for it, ordered by the best (lowest) per-role
 * `priority`, then by `nav_item.sort_order`. A **section is derived**: it shows
 * only if the user sees ≥1 of its active items; sections order by the best
 * per-role `role_nav_section.priority` (now section order only), then
 * `nav_section.sort_order`.
 */
export async function getNavForUser(
  roleNames: string[],
  isAdmin: boolean,
): Promise<ResolvedNavSection[]> {
  if (!isAdmin) return getGrantedNav(roleNames);

  const sections = (await db.selectFrom("nav_section").selectAll().execute()).map(
    (s) => ({ ...s, priority: 0 }),
  );
  if (sections.length === 0) return [];
  sections.sort((a, b) => a.priority - b.priority || a.sort_order - b.sort_order);

  const sectionIds = sections.map((s) => s.section_id);
  const items = await db
    .selectFrom("nav_item")
    .selectAll()
    .where("section_id", "in", sectionIds)
    .where("is_active", "=", true)
    .orderBy("sort_order", "asc")
    .execute();

  const itemsBySection = groupBySection(items);
  return sections.map((s) => toResolvedSection(s, itemsBySection.get(s.section_id) ?? []));
}

/**
 * Page-granular resolution for a non-admin user (ADR 0008). Visible items come
 * from `role_nav_item` (best per-role priority); a section is included only if
 * it has ≥1 visible active item, and is ordered by the best per-role
 * `role_nav_section.priority` (which now carries *section order* only, not the
 * grant itself).
 */
async function getGrantedNav(roleNames: string[]): Promise<ResolvedNavSection[]> {
  if (roleNames.length === 0) return [];

  const grantRows = await db
    .selectFrom("role_nav_item")
    .innerJoin("nav_item", "nav_item.item_id", "role_nav_item.item_id")
    .innerJoin("role", "role.role_id", "role_nav_item.role_id")
    .select(["nav_item.item_id", "nav_item.section_id", "role_nav_item.priority"])
    .where("nav_item.is_active", "=", true)
    .where("role.name", "in", roleNames)
    .execute();
  if (grantRows.length === 0) return [];

  const bestItemPriority = new Map<number, number>();
  const sectionIdSet = new Set<number>();
  for (const r of grantRows) {
    const cur = bestItemPriority.get(r.item_id);
    if (cur === undefined || r.priority < cur) bestItemPriority.set(r.item_id, r.priority);
    sectionIdSet.add(r.section_id);
  }
  const sectionIds = [...sectionIdSet];

  const [items, sectionRows, secPrioRows] = await Promise.all([
    db.selectFrom("nav_item").selectAll().where("item_id", "in", [...bestItemPriority.keys()]).execute(),
    db.selectFrom("nav_section").selectAll().where("section_id", "in", sectionIds).where("is_active", "=", true).execute(),
    db
      .selectFrom("role_nav_section")
      .innerJoin("role", "role.role_id", "role_nav_section.role_id")
      .select(["role_nav_section.section_id", "role_nav_section.priority"])
      .where("role.name", "in", roleNames)
      .where("role_nav_section.section_id", "in", sectionIds)
      .execute(),
  ]);
  if (sectionRows.length === 0) return [];

  const bestSecPriority = new Map<number, number>();
  for (const r of secPrioRows) {
    const cur = bestSecPriority.get(r.section_id);
    if (cur === undefined || r.priority < cur) bestSecPriority.set(r.section_id, r.priority);
  }

  const itemsBySection = new Map<number, NavItemRow[]>();
  for (const it of items) {
    const arr = itemsBySection.get(it.section_id) ?? [];
    arr.push(it);
    itemsBySection.set(it.section_id, arr);
  }
  for (const arr of itemsBySection.values()) {
    arr.sort(
      (a, b) =>
        (bestItemPriority.get(a.item_id) ?? 0) - (bestItemPriority.get(b.item_id) ?? 0) ||
        a.sort_order - b.sort_order,
    );
  }

  return sectionRows
    .filter((s) => (itemsBySection.get(s.section_id)?.length ?? 0) > 0)
    .sort((a, b) => {
      const pa = bestSecPriority.get(a.section_id);
      const pb = bestSecPriority.get(b.section_id);
      if (pa !== undefined && pb !== undefined) return pa - pb || a.sort_order - b.sort_order;
      if (pa !== undefined) return -1;
      if (pb !== undefined) return 1;
      return a.sort_order - b.sort_order;
    })
    .map((s) => toResolvedSection(s, itemsBySection.get(s.section_id) ?? []));
}

function groupBySection(items: NavItemRow[]): Map<number, NavItemRow[]> {
  const map = new Map<number, NavItemRow[]>();
  for (const it of items) {
    const arr = map.get(it.section_id) ?? [];
    arr.push(it);
    map.set(it.section_id, arr);
  }
  return map;
}

function toResolvedSection(s: NavSectionRow, sectionItems: NavItemRow[]): ResolvedNavSection {
  return {
    section_id: s.section_id,
    code: s.code,
    label: s.label,
    icon: s.icon,
    base_path: s.base_path,
    is_active: s.is_active,
    items: nestItems(sectionItems),
  };
}

function nestItems(items: NavItemRow[]): ResolvedNavItem[] {
  const byId = new Map<number, ResolvedNavItem>(
    items.map((i) => [
      i.item_id,
      { item_id: i.item_id, label: i.label, icon: i.icon, href: i.href, children: [] },
    ]),
  );
  const roots: ResolvedNavItem[] = [];
  for (const it of items) {
    const node = byId.get(it.item_id);
    if (!node) continue;
    if (it.parent_item_id != null && byId.has(it.parent_item_id)) {
      byId.get(it.parent_item_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

// ---------------------------------------------------------------------------
// Admin reads
// ---------------------------------------------------------------------------

export async function listSections(): Promise<NavSectionRow[]> {
  return db.selectFrom("nav_section").selectAll().orderBy("sort_order", "asc").execute();
}

export async function listItems(): Promise<NavItemRow[]> {
  return db.selectFrom("nav_item").selectAll().orderBy("sort_order", "asc").execute();
}

export interface SectionGrant {
  role_id: number;
  priority: number;
}

export async function listSectionGrants(sectionId: number): Promise<SectionGrant[]> {
  return db
    .selectFrom("role_nav_section")
    .select(["role_id", "priority"])
    .where("section_id", "=", sectionId)
    .execute();
}

export interface RoleSectionGrant {
  section_id: number;
  priority: number;
}

/** Role-centric read of `role_nav_section` (the permission manager filters by
 * role, so grants are loaded per role rather than per section). */
export async function listRoleSectionGrants(roleId: number): Promise<RoleSectionGrant[]> {
  return db
    .selectFrom("role_nav_section")
    .select(["section_id", "priority"])
    .where("role_id", "=", roleId)
    .execute();
}

export async function findSectionById(id: number): Promise<NavSectionRow | undefined> {
  return (
    (await db
      .selectFrom("nav_section")
      .selectAll()
      .where("section_id", "=", id)
      .executeTakeFirst()) ?? undefined
  );
}

export async function findItemById(id: number): Promise<NavItemRow | undefined> {
  return (
    (await db
      .selectFrom("nav_item")
      .selectAll()
      .where("item_id", "=", id)
      .executeTakeFirst()) ?? undefined
  );
}

// ---------------------------------------------------------------------------
// Admin writes — sections are seeded by module migrations (routes are owned
// by code); the admin edits label/icon/order/active + role grants, but
// cannot create or rename `base_path`. No `createSection` on purpose.
// ---------------------------------------------------------------------------

export interface UpdateSectionInput {
  label?: string;
  icon?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export async function updateSection(id: number, input: UpdateSectionInput): Promise<void> {
  const changes: Partial<Insertable<NavSection>> = { updated_at: new Date() };
  if (input.label !== undefined) {
    const trimmed = input.label.trim();
    if (trimmed) changes.label = trimmed;
  }
  if (input.icon !== undefined) changes.icon = input.icon;
  if (input.sort_order !== undefined) changes.sort_order = input.sort_order;
  if (input.is_active !== undefined) changes.is_active = input.is_active;
  await db.updateTable("nav_section").set(changes).where("section_id", "=", id).execute();
}

/** Hard delete. Cascades to `nav_item` and `role_nav_section` rows (V7). */
export async function deleteSection(id: number): Promise<void> {
  await db.deleteFrom("nav_section").where("section_id", "=", id).execute();
}

export interface CreateItemInput {
  section_id: number;
  parent_item_id?: number | null;
  label: string;
  icon?: string | null;
  href: string;
  sort_order?: number;
}

export async function createItem(input: CreateItemInput): Promise<NavItemRow> {
  const result = await db
    .insertInto("nav_item")
    .values({
      section_id: input.section_id,
      parent_item_id: input.parent_item_id ?? null,
      label: input.label.trim(),
      icon: input.icon ?? null,
      href: input.href.trim(),
      sort_order: input.sort_order ?? 0,
    })
    .output("inserted.item_id")
    .executeTakeFirst();
  if (!result) throw new Error("Nav item insert returned no identity");
  const row = await db
    .selectFrom("nav_item")
    .selectAll()
    .where("item_id", "=", result.item_id)
    .executeTakeFirst();
  if (!row) throw new Error("Nav item not found after insert");
  return row;
}

export interface UpdateItemInput {
  label?: string;
  icon?: string | null;
  href?: string;
  parent_item_id?: number | null;
  sort_order?: number;
  is_active?: boolean;
}

export async function updateItem(id: number, input: UpdateItemInput): Promise<void> {
  const changes: Partial<Insertable<NavItem>> = { updated_at: new Date() };
  if (input.label !== undefined) {
    const trimmed = input.label.trim();
    if (trimmed) changes.label = trimmed;
  }
  if (input.icon !== undefined) changes.icon = input.icon;
  if (input.href !== undefined) {
    const trimmed = input.href.trim();
    if (trimmed) changes.href = trimmed;
  }
  if (input.parent_item_id !== undefined) changes.parent_item_id = input.parent_item_id;
  if (input.sort_order !== undefined) changes.sort_order = input.sort_order;
  if (input.is_active !== undefined) changes.is_active = input.is_active;
  await db.updateTable("nav_item").set(changes).where("item_id", "=", id).execute();
}

export async function deleteItem(id: number): Promise<void> {
  await db.deleteFrom("nav_item").where("item_id", "=", id).execute();
}

/** Replace the full section grant set for a role in one transaction (dual of
 * `setSectionGrants` — same table, role-centric axis). */
export async function setRoleSectionGrants(
  roleId: number,
  grants: RoleSectionGrant[],
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("role_nav_section").where("role_id", "=", roleId).execute();
    if (grants.length === 0) return;
    await trx
      .insertInto("role_nav_section")
      .values(
        grants.map((g) => ({
          role_id: roleId,
          section_id: g.section_id,
          priority: g.priority,
        })),
      )
      .execute();
  });
}

/** Replace the full grant set for a section in one transaction. */
export async function setSectionGrants(
  sectionId: number,
  grants: SectionGrant[],
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("role_nav_section").where("section_id", "=", sectionId).execute();
    if (grants.length === 0) return;
    await trx
      .insertInto("role_nav_section")
      .values(
        grants.map((g) => ({
          role_id: g.role_id,
          section_id: sectionId,
          priority: g.priority,
        })),
      )
      .execute();
  });
}

// ---------------------------------------------------------------------------
// Page-level grants (role_nav_item, V16 / ADR 0008) — the source of truth for
// per-role page visibility + intra-section order. The permission manager reads
// and writes these role-centrically (mirrors listRoleSectionGrants).
// ---------------------------------------------------------------------------

export interface RoleItemGrant {
  item_id: number;
  priority: number;
}

/** Pages visible to a role, with their per-role order (priority). */
export async function listRoleItemGrants(roleId: number): Promise<RoleItemGrant[]> {
  return db
    .selectFrom("role_nav_item")
    .select(["item_id", "priority"])
    .where("role_id", "=", roleId)
    .execute();
}

/** Replace the full page-visibility set for a role in one transaction. */
export async function setRoleItemGrants(
  roleId: number,
  grants: RoleItemGrant[],
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("role_nav_item").where("role_id", "=", roleId).execute();
    if (grants.length === 0) return;
    await trx
      .insertInto("role_nav_item")
      .values(
        grants.map((g) => ({ role_id: roleId, item_id: g.item_id, priority: g.priority })),
      )
      .execute();
  });
}

/**
 * When an admin adds a page to a section, grant it to every role that already
 * sees that section (has ≥1 `role_nav_item` on an active item there), so the
 * new page appears for them instead of being invisible until re-granted.
 * `admin` holds no grant rows and is unaffected (it bypasses at the app layer).
 */
export async function grantItemToSectionRoles(
  sectionId: number,
  itemId: number,
  priority: number,
): Promise<void> {
  const roles = await db
    .selectFrom("role_nav_item")
    .innerJoin("nav_item", "nav_item.item_id", "role_nav_item.item_id")
    .select("role_nav_item.role_id")
    .where("nav_item.section_id", "=", sectionId)
    .groupBy("role_nav_item.role_id")
    .execute();
  if (roles.length === 0) return;
  await db
    .insertInto("role_nav_item")
    .values(roles.map((r) => ({ role_id: r.role_id, item_id: itemId, priority })))
    .execute();
}

// ---------------------------------------------------------------------------
// Nav registry (role-independent) — used by the page-level guard to decide
// whether a pathname corresponds to a registered nav item at all.
// ---------------------------------------------------------------------------

export interface NavItemRef {
  item_id: number;
  section_id: number;
  href: string;
}

export interface NavSectionRef {
  section_id: number;
  code: string;
  base_path: string;
}

export async function listActiveItemRefs(): Promise<NavItemRef[]> {
  return db
    .selectFrom("nav_item")
    .select(["item_id", "section_id", "href"])
    .where("is_active", "=", true)
    .execute();
}

export async function listSectionRefs(): Promise<NavSectionRef[]> {
  return db.selectFrom("nav_section").select(["section_id", "code", "base_path"]).execute();
}
