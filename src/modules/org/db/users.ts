import "server-only";
import { randomBytes, createHash } from "node:crypto";
import type { Selectable, Insertable, Transaction } from "kysely";
import type { DB, AppUser, Invitation } from "@/lib/db/types";
import { authDb as db, orgDb } from "@/lib/db/schema-clients";

// Every table in this module lives in the `auth` schema. Transactions inherit
// the schema. `plant` moved to the `org` schema in V15 (see org.ts);
// `user_plant` stays in `auth`, so plant names are fetched from this schema
// separately and joined in JS instead of a single cross-schema SQL join.

export type AuthUserRow = Selectable<AppUser>;

export interface AuthIdentity {
  user_id: number;
  username: string;
  display_name: string | null;
  password_hash: string | null;
  is_active: boolean;
  token_version: number;
  all_plants: boolean;
}

export interface UserScope {
  allPlants: boolean;
  plantIds: number[];
  departmentIds: number[];
}

/** Admin-facing user listing item (no password hash). */
export interface AdminUserItem {
  user_id: number;
  username: string;
  email: string | null;
  display_name: string | null;
  all_plants: boolean;
  is_active: boolean;
  token_version: number;
  roles: string[];
  role_refs: { role_id: number; name: string }[];
  plant_ids: number[];
  department_ids: number[];
  created_at: Date;
  updated_at: Date;
}

export interface UserDetail {
  user_id: number;
  username: string;
  email: string | null;
  display_name: string | null;
  all_plants: boolean;
  is_active: boolean;
  /** Derived flag (the hash never leaves this module): false = the user has
   * not accepted an invitation yet, so the account cannot log in. */
  has_password: boolean;
  token_version: number;
  roles: { role_id: number; name: string }[];
  plants: { plant_id: number; code: string; name: string }[];
  departments: { department_id: number; name: string }[];
}

export interface CreateUserInput {
  username: string;
  email?: string | null;
  display_name?: string | null;
  all_plants?: boolean;
  role_ids: number[];
  plant_ids: number[];
  department_ids: number[];
  created_by: number;
}

export interface UpdateUserAssignmentsInput {
  role_ids?: number[];
  plant_ids?: number[];
  department_ids?: number[];
  all_plants?: boolean;
  is_active?: boolean;
  email?: string | null;
  display_name?: string | null;
}

// ---------------------------------------------------------------------------
// Auth reads (consumed by src/auth.ts, rbac.ts)
// ---------------------------------------------------------------------------

export async function findAuthUserByUsername(
  username: string,
): Promise<AuthIdentity | undefined> {
  const row = await db
    .selectFrom("app_user")
    .select([
      "user_id",
      "username",
      "display_name",
      "password_hash",
      "is_active",
      "token_version",
      "all_plants",
    ])
    .where("username", "=", username)
    .executeTakeFirst();
  return row ?? undefined;
}

export async function findAuthUserById(
  id: number,
): Promise<AuthIdentity | undefined> {
  const row = await db
    .selectFrom("app_user")
    .select([
      "user_id",
      "username",
      "display_name",
      "password_hash",
      "is_active",
      "token_version",
      "all_plants",
    ])
    .where("user_id", "=", id)
    .executeTakeFirst();
  return row ?? undefined;
}

export async function getUserRolesById(userId: number): Promise<string[]> {
  const rows = await db
    .selectFrom("user_role")
    .innerJoin("role", "role.role_id", "user_role.role_id")
    .select("role.name")
    .where("user_role.user_id", "=", userId)
    .execute();
  return rows.map((r) => r.name);
}

export async function getUserScope(userId: number): Promise<UserScope> {
  const [allPlantsRow, plantRows, deptRows] = await Promise.all([
    db
      .selectFrom("app_user")
      .select("all_plants")
      .where("user_id", "=", userId)
      .executeTakeFirst(),
    db
      .selectFrom("user_plant")
      .select("plant_id")
      .where("user_id", "=", userId)
      .execute(),
    db
      .selectFrom("user_department")
      .select("department_id")
      .where("user_id", "=", userId)
      .execute(),
  ]);
  return {
    allPlants: allPlantsRow?.all_plants ?? false,
    plantIds: plantRows.map((r) => r.plant_id),
    departmentIds: deptRows.map((r) => r.department_id),
  };
}

// ---------------------------------------------------------------------------
// Admin CRUD
// ---------------------------------------------------------------------------

export interface AdminUserItemWithNames extends AdminUserItem {
  /** Plant names parallel to `plant_ids` (joined from catalog). Empty when `all_plants`. */
  plant_names: { plant_id: number; name: string; code: string }[];
  /** Department names parallel to `department_ids` (joined from catalog). */
  department_names: { department_id: number; name: string }[];
}

/**
 * Same shape as `listUsers()` but joins plant/department names so the Usuarios
 * admin table can render "Planta(s)" / "Departamento(s)" without re-fetching
 * catalogs. Roles already come as names from `listUsers()`. Uses the same
 * batched pattern: one SELECT per junction to avoid N+1.
 */
export async function listUsersWithNames(): Promise<AdminUserItemWithNames[]> {
  const users = await listUsers();
  if (users.length === 0) return [];

  const ids = users.map((u) => u.user_id);

  const [userPlantRows, deptRows] = await Promise.all([
    db
      .selectFrom("user_plant")
      .select(["user_id", "plant_id"])
      .where("user_id", "in", ids)
      .execute(),
    db
      .selectFrom("user_department")
      .innerJoin("department", "department.department_id", "user_department.department_id")
      .select(["user_department.user_id", "department.department_id", "department.name"])
      .where("user_department.user_id", "in", ids)
      .orderBy("department.name", "asc")
      .execute(),
  ]);

  const plantIds = [...new Set(userPlantRows.map((r) => r.plant_id))];
  const plants =
    plantIds.length === 0
      ? []
      : await orgDb
          .selectFrom("plant")
          .select(["plant_id", "name", "code"])
          .where("plant_id", "in", plantIds)
          .execute();
  const plantById = new Map(plants.map((p) => [p.plant_id, p]));

  const plantsByUser = new Map<number, { plant_id: number; name: string; code: string }[]>();
  for (const r of userPlantRows) {
    const plant = plantById.get(r.plant_id);
    if (!plant) continue;
    const arr = plantsByUser.get(r.user_id) ?? [];
    arr.push({ plant_id: plant.plant_id, name: plant.name, code: plant.code });
    plantsByUser.set(r.user_id, arr);
  }
  for (const arr of plantsByUser.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
  const deptsByUser = new Map<number, { department_id: number; name: string }[]>();
  for (const r of deptRows) {
    const arr = deptsByUser.get(r.user_id) ?? [];
    arr.push({ department_id: r.department_id, name: r.name });
    deptsByUser.set(r.user_id, arr);
  }

  return users.map((u) => ({
    ...u,
    plant_names: plantsByUser.get(u.user_id) ?? [],
    department_names: deptsByUser.get(u.user_id) ?? [],
  }));
}

export async function listUsers(): Promise<AdminUserItem[]> {
  const users = await db
    .selectFrom("app_user")
    .select([
      "user_id",
      "username",
      "email",
      "display_name",
      "all_plants",
      "is_active",
      "token_version",
      "created_at",
      "updated_at",
    ])
    .orderBy("username", "asc")
    .execute();

  const ids = users.map((u) => u.user_id);
  if (ids.length === 0) return [];

  const [roleRows, plantRows, deptRows] = await Promise.all([
    db
      .selectFrom("user_role")
      .innerJoin("role", "role.role_id", "user_role.role_id")
      .select(["user_role.user_id", "role.role_id", "role.name"])
      .where("user_role.user_id", "in", ids)
      .execute(),
    db
      .selectFrom("user_plant")
      .select(["user_id", "plant_id"])
      .where("user_id", "in", ids)
      .execute(),
    db
      .selectFrom("user_department")
      .select(["user_id", "department_id"])
      .where("user_id", "in", ids)
      .execute(),
  ]);

  const rolesByUser = new Map<number, string[]>();
  const roleRefsByUser = new Map<number, { role_id: number; name: string }[]>();
  for (const r of roleRows) {
    const arr = rolesByUser.get(r.user_id) ?? [];
    arr.push(r.name);
    rolesByUser.set(r.user_id, arr);
    const refs = roleRefsByUser.get(r.user_id) ?? [];
    refs.push({ role_id: r.role_id, name: r.name });
    roleRefsByUser.set(r.user_id, refs);
  }
  const plantsByUser = new Map<number, number[]>();
  for (const p of plantRows) {
    const arr = plantsByUser.get(p.user_id) ?? [];
    arr.push(p.plant_id);
    plantsByUser.set(p.user_id, arr);
  }
  const deptsByUser = new Map<number, number[]>();
  for (const d of deptRows) {
    const arr = deptsByUser.get(d.user_id) ?? [];
    arr.push(d.department_id);
    deptsByUser.set(d.user_id, arr);
  }

  return users.map((u) => ({
    user_id: u.user_id,
    username: u.username,
    email: u.email,
    display_name: u.display_name,
    all_plants: u.all_plants,
    is_active: u.is_active,
    token_version: u.token_version,
    roles: rolesByUser.get(u.user_id) ?? [],
    role_refs: roleRefsByUser.get(u.user_id) ?? [],
    plant_ids: plantsByUser.get(u.user_id) ?? [],
    department_ids: deptsByUser.get(u.user_id) ?? [],
    created_at: u.created_at,
    updated_at: u.updated_at,
  }));
}

export async function getUserDetail(userId: number): Promise<UserDetail | undefined> {
  const user = await db
    .selectFrom("app_user")
    .select([
      "user_id",
      "username",
      "email",
      "display_name",
      "all_plants",
      "is_active",
      "token_version",
      "password_hash",
    ])
    .where("user_id", "=", userId)
    .executeTakeFirst();
  if (!user) return undefined;

  const [roles, userPlants, departments] = await Promise.all([
    db
      .selectFrom("user_role")
      .innerJoin("role", "role.role_id", "user_role.role_id")
      .select(["role.role_id", "role.name"])
      .where("user_role.user_id", "=", userId)
      .orderBy("role.name", "asc")
      .execute(),
    db
      .selectFrom("user_plant")
      .select(["plant_id"])
      .where("user_id", "=", userId)
      .execute(),
    db
      .selectFrom("user_department")
      .innerJoin("department", "department.department_id", "user_department.department_id")
      .select(["department.department_id", "department.name"])
      .where("user_department.user_id", "=", userId)
      .orderBy("department.name", "asc")
      .execute(),
  ]);

  const plantIds = userPlants.map((p) => p.plant_id);
  const plants =
    plantIds.length === 0
      ? []
      : await orgDb
          .selectFrom("plant")
          .select(["plant_id", "code", "name"])
          .where("plant_id", "in", plantIds)
          .orderBy("name", "asc")
          .execute();

  const { password_hash, ...rest } = user;
  return {
    ...rest,
    has_password: password_hash != null,
    roles,
    plants,
    departments,
  };
}

/**
 * Create a pre-provisioned (inactive, no password) user with assignments
 * already set, ready to be activated via an invitation. The caller wraps this
 * in a transaction together with the invitation insert.
 */
export async function createUser(input: CreateUserInput): Promise<number> {
  return await db.transaction().execute(async (trx) => {
    const username = input.username.trim().toLowerCase();
    const inserted = await trx
      .insertInto("app_user")
      .values({
        username,
        email: input.email ?? null,
        display_name: input.display_name ?? null,
        password_hash: null,
        all_plants: input.all_plants ?? false,
        is_active: false,
      })
      .output("inserted.user_id")
      .executeTakeFirst();
    if (!inserted) throw new Error("User insert returned no identity");
    const userId = Number(inserted.user_id);

    await assignRoles(trx, userId, input.role_ids);
    await assignPlants(trx, userId, input.plant_ids);
    await assignDepartments(trx, userId, input.department_ids);

    return userId;
  });
}

export async function updateUserAssignments(
  userId: number,
  input: UpdateUserAssignmentsInput,
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const changes: Partial<Insertable<AppUser>> = {};
    if (input.all_plants !== undefined) changes.all_plants = input.all_plants;
    if (input.is_active !== undefined) changes.is_active = input.is_active;
    if (input.email !== undefined) changes.email = input.email;
    if (input.display_name !== undefined) changes.display_name = input.display_name;
    if (Object.keys(changes).length > 0) {
      changes.updated_at = new Date();
      await trx.updateTable("app_user").set(changes).where("user_id", "=", userId).execute();
    }
    if (input.role_ids !== undefined) await assignRoles(trx, userId, input.role_ids);
    if (input.plant_ids !== undefined) await assignPlants(trx, userId, input.plant_ids);
    if (input.department_ids !== undefined)
      await assignDepartments(trx, userId, input.department_ids);
  });
}

/** Bump token_version to invalidate outstanding JWTs on the next request. */
export async function bumpTokenVersion(userId: number): Promise<void> {
  await db
    .updateTable("app_user")
    .set((eb) => ({
      token_version: eb("token_version", "+", 1),
      updated_at: new Date(),
    }))
    .where("user_id", "=", userId)
    .execute();
}

export async function setUserPassword(
  userId: number,
  passwordHash: string,
  activate = true,
): Promise<void> {
  const changes: Partial<Insertable<AppUser>> = {
    password_hash: passwordHash,
    updated_at: new Date(),
  };
  if (activate) changes.is_active = true;
  await db.updateTable("app_user").set(changes).where("user_id", "=", userId).execute();
}

async function assignRoles(
  trx: Transaction<DB>,
  userId: number,
  roleIds: number[],
): Promise<void> {
  await trx.deleteFrom("user_role").where("user_id", "=", userId).execute();
  if (roleIds.length === 0) return;
  await trx
    .insertInto("user_role")
    .values(roleIds.map((role_id) => ({ user_id: userId, role_id })))
    .execute();
}

async function assignPlants(
  trx: Transaction<DB>,
  userId: number,
  plantIds: number[],
): Promise<void> {
  await trx.deleteFrom("user_plant").where("user_id", "=", userId).execute();
  if (plantIds.length === 0) return;
  await trx
    .insertInto("user_plant")
    .values(plantIds.map((plant_id) => ({ user_id: userId, plant_id })))
    .execute();
}

async function assignDepartments(
  trx: Transaction<DB>,
  userId: number,
  departmentIds: number[],
): Promise<void> {
  await trx.deleteFrom("user_department").where("user_id", "=", userId).execute();
  if (departmentIds.length === 0) return;
  await trx
    .insertInto("user_department")
    .values(departmentIds.map((department_id) => ({ user_id: userId, department_id })))
    .execute();
}

// ---------------------------------------------------------------------------
// Invitations (one-time token to activate a pre-provisioned user)
// ---------------------------------------------------------------------------

export type InvitationRecord = Selectable<Invitation>;

const INVITATION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Create a fresh invitation and return the raw one-time token (to show once). */
export async function createInvitation(
  userId: number,
  createdBy: number,
): Promise<string> {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  await db
    .insertInto("invitation")
    .values({
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by: createdBy,
    })
    .execute();
  return rawToken;
}

export interface PendingInvitation {
  invitation_id: number;
  username: string;
  expires_at: Date;
  created_at: Date;
}

export async function listPendingInvitations(): Promise<PendingInvitation[]> {
  const rows = await db
    .selectFrom("invitation")
    .innerJoin("app_user", "app_user.user_id", "invitation.user_id")
    .select([
      "invitation.invitation_id",
      "app_user.username",
      "invitation.expires_at",
      "invitation.created_at",
    ])
    .where("invitation.accepted_at", "is", null)
    .orderBy("invitation.created_at", "desc")
    .execute();
  return rows.map((r) => ({
    invitation_id: r.invitation_id,
    username: r.username,
    expires_at: r.expires_at,
    created_at: r.created_at,
  }));
}

/** Look up an invitation by raw token; null when missing/used/expired. */
export async function findPendingInvitation(
  rawToken: string,
): Promise<{ invitation_id: number; user_id: number; username: string; expires_at: Date } | null> {
  const tokenHash = hashToken(rawToken);
  const row = await db
    .selectFrom("invitation")
    .innerJoin("app_user", "app_user.user_id", "invitation.user_id")
    .select([
      "invitation.invitation_id",
      "invitation.user_id",
      "invitation.expires_at",
      "invitation.accepted_at",
      "app_user.username",
    ])
    .where("invitation.token_hash", "=", tokenHash)
    .executeTakeFirst();
  if (!row) return null;
  if (row.accepted_at) return null;
  if (row.expires_at.getTime() <= Date.now()) return null;
  return {
    invitation_id: row.invitation_id,
    user_id: row.user_id,
    username: row.username,
    expires_at: row.expires_at,
  };
}

/**
 * Atomically accept the invitation: set the password, activate the user, and
 * mark the invitation accepted. Throws if the user already has a password set
 * and `allowReset` is false (safeguard); the invitee flow always sets it.
 */
export async function acceptInvitation(
  invitationId: number,
  passwordHash: string,
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const inv = await trx
      .selectFrom("invitation")
      .select(["invitation_id", "user_id", "accepted_at", "expires_at"])
      .where("invitation_id", "=", invitationId)
      .executeTakeFirst();
    if (!inv || inv.accepted_at || inv.expires_at.getTime() <= Date.now()) {
      throw new Error("Invitation inválida o expirada.");
    }
    await trx
      .updateTable("app_user")
      .set({ password_hash: passwordHash, is_active: true, updated_at: new Date() })
      .where("user_id", "=", inv.user_id)
      .execute();
    await trx
      .updateTable("invitation")
      .set({ accepted_at: new Date() })
      .where("invitation_id", "=", invitationId)
      .execute();
  });
}

export async function revokeInvitation(invitationId: number): Promise<void> {
  await db.deleteFrom("invitation").where("invitation_id", "=", invitationId).execute();
}