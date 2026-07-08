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
 * protected-role pattern in org.ts). Everyone else sees active sections
 * granted to any of their roles, ordered by the best (lowest) priority across
 * those roles, then by `nav_section.sort_order`.
 */
export async function getNavForUser(
  roleNames: string[],
  isAdmin: boolean,
): Promise<ResolvedNavSection[]> {
  const sections = isAdmin
    ? (await db
        .selectFrom("nav_section")
        .selectAll()
        .execute()).map((s) => ({ ...s, priority: 0 }))
    : await getGrantedSections(roleNames);

  if (sections.length === 0) return [];

  sections.sort(
    (a, b) => a.priority - b.priority || a.sort_order - b.sort_order,
  );

  const sectionIds = sections.map((s) => s.section_id);
  const items = await db
    .selectFrom("nav_item")
    .selectAll()
    .where("section_id", "in", sectionIds)
    .where("is_active", "=", true)
    .orderBy("sort_order", "asc")
    .execute();

  const itemsBySection = new Map<number, NavItemRow[]>();
  for (const it of items) {
    const arr = itemsBySection.get(it.section_id) ?? [];
    arr.push(it);
    itemsBySection.set(it.section_id, arr);
  }

  return sections.map((s) => ({
    section_id: s.section_id,
    code: s.code,
    label: s.label,
    icon: s.icon,
    base_path: s.base_path,
    is_active: s.is_active,
    items: nestItems(itemsBySection.get(s.section_id) ?? []),
  }));
}

async function getGrantedSections(
  roleNames: string[],
): Promise<(NavSectionRow & { priority: number })[]> {
  if (roleNames.length === 0) return [];
  const rows = await db
    .selectFrom("nav_section")
    .innerJoin(
      "role_nav_section",
      "role_nav_section.section_id",
      "nav_section.section_id",
    )
    .innerJoin("role", "role.role_id", "role_nav_section.role_id")
    .selectAll("nav_section")
    .select("role_nav_section.priority")
    .where("nav_section.is_active", "=", true)
    .where("role.name", "in", roleNames)
    .execute();

  const bestBySection = new Map<number, NavSectionRow & { priority: number }>();
  for (const r of rows) {
    const existing = bestBySection.get(r.section_id);
    if (!existing || r.priority < existing.priority) {
      bestBySection.set(r.section_id, r);
    }
  }
  return [...bestBySection.values()];
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
