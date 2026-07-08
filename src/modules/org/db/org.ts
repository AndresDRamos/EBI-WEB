import "server-only";
import { db as rootDb } from "@/lib/db/client";
import type { Selectable, Insertable, Transaction } from "kysely";
import type { Plant, Department, Role } from "@/lib/db/types";

// `role` and `department` live in the `auth` schema; `plant` moved to the new
// `org` schema in V15 (organization vs identity split). See the note in
// users.ts: kysely-codegen drops the schema from the generated keys, so bind
// the client to the right schema or SQL Server looks under dbo and 208s.
const db = rootDb.withSchema("auth");
const orgDb = rootDb.withSchema("org");

export type PlantRow = Selectable<Plant>;
export type DepartmentRow = Selectable<Department>;
export type RoleRow = Selectable<Role>;

/** Name of the role protected at the app layer from rename/deactivate/delete. */
export const PROTECTED_ROLE = "admin";

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export type RoleWithDepartment = RoleRow & { department_name: string | null };

/**
 * Roles are ACCESS PROFILES since V8: `department_id` scopes a profile to a
 * department (NULL = cross-department, like `admin`). Same table name — the
 * semantic shift is documented in ADR 0004.
 */
export async function listRoles(activeOnly = false): Promise<RoleWithDepartment[]> {
  let q = db
    .selectFrom("role")
    .leftJoin("department", "department.department_id", "role.department_id")
    .selectAll("role")
    .select("department.name as department_name");
  if (activeOnly) q = q.where("role.is_active", "=", true);
  return q.orderBy("role.name", "asc").execute();
}

export interface CreateRoleInput {
  name: string;
  description?: string | null;
  department_id?: number | null;
}

export async function createRole(input: CreateRoleInput): Promise<RoleRow> {
  const name = input.name.trim();
  const result = await db
    .insertInto("role")
    .values({
      name,
      description: input.description ? input.description.trim() : null,
      department_id: input.department_id ?? null,
    })
    .output("inserted.role_id")
    .executeTakeFirst();
  if (!result) throw new Error("Role insert returned no identity");
  const row = await db
    .selectFrom("role")
    .selectAll()
    .where("role_id", "=", result.role_id)
    .executeTakeFirst();
  if (!row) throw new Error("Role not found after insert");
  return row;
}

export interface UpdateRoleInput {
  name?: string;
  description?: string | null;
  is_active?: boolean;
  department_id?: number | null;
}

/**
 * Update a role. The `admin` role is protected at the app layer: it cannot be
 * renamed or deactivated (its department IS assignable — the bypass keys on
 * the name). Other roles (`viewer`, custom roles) are normal CRUD — caller
 * can rename, edit description, activate/deactivate freely.
 *
 * @param currentName the existing role name as loaded from the DB before the
 *   user attempted the change; used to detect protected-role rename/deactivate.
 */
export async function updateRole(
  id: number,
  input: UpdateRoleInput,
  current?: { name: string } | null,
): Promise<void> {
  const changes: Partial<Insertable<Role>> = {};
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (current && current.name === PROTECTED_ROLE && trimmed !== PROTECTED_ROLE) {
      throw new RoleProtectedError(
        `El rol '${PROTECTED_ROLE}' no se puede renombrar.`,
      );
    }
    if (trimmed) changes.name = trimmed;
  }
  if (input.description !== undefined) {
    changes.description =
      typeof input.description === "string" && input.description.trim()
        ? input.description.trim()
        : null;
  }
  if (input.is_active !== undefined) {
    if (
      input.is_active === false &&
      current &&
      current.name === PROTECTED_ROLE
    ) {
      throw new RoleProtectedError(
        `El rol '${PROTECTED_ROLE}' no se puede desactivar.`,
      );
    }
    changes.is_active = input.is_active;
  }
  // department_id is free for every role, including `admin` (plan
  // admin-panel-regroup): the protection covers name/state/deletion only —
  // the permission bypass keys on the role NAME, never on department_id.
  if (input.department_id !== undefined) {
    changes.department_id = input.department_id;
  }
  if (Object.keys(changes).length === 0) return;
  await db.updateTable("role").set(changes).where("role_id", "=", id).execute();
}

/**
 * Soft-delete: set `is_active=false`. Same protection as `updateRole` for the
 * `admin` role.
 */
export async function softDeleteRole(
  id: number,
  current?: { name: string } | null,
): Promise<void> {
  if (current && current.name === PROTECTED_ROLE) {
    throw new RoleProtectedError(
      `El rol '${PROTECTED_ROLE}' no se puede desactivar.`,
    );
  }
  await db
    .updateTable("role")
    .set({ is_active: false })
    .where("role_id", "=", id)
    .execute();
}

/**
 * Hard delete: removes the role row. Caller is responsible for the
 * protected-role check at the API layer too, so a delete can never cross the
 * FK silently. Grant rows (`role_permission`, `role_nav_section`,
 * `role_nav_item`) are config OF the profile, so they are cleared in the same
 * transaction; the remaining NO ACTION FK (`user_role`) still 409s when users
 * are assigned — by design. `role_nav_item`'s FK to `role` is NO ACTION (V16),
 * so it must be cleared here or deleting a role with page grants fails.
 */
export async function deleteRole(id: number): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("role_permission").where("role_id", "=", id).execute();
    await trx.deleteFrom("role_nav_item").where("role_id", "=", id).execute();
    await trx.deleteFrom("role_nav_section").where("role_id", "=", id).execute();
    await trx.deleteFrom("role").where("role_id", "=", id).execute();
  });
}

/** Fetch the role by id (used for the protected-role guard). */
export async function findRoleById(
  id: number,
): Promise<RoleRow | undefined> {
  const row = await db
    .selectFrom("role")
    .selectAll()
    .where("role_id", "=", id)
    .executeTakeFirst();
  return row ?? undefined;
}

/** Sentinel thrown when a CRUD op targets the protected `admin` role. */
export class RoleProtectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoleProtectedError";
  }
}

// ---------------------------------------------------------------------------
// Plants
// ---------------------------------------------------------------------------

export async function listPlants(activeOnly = false): Promise<PlantRow[]> {
  let q = orgDb.selectFrom("plant").selectAll();
  if (activeOnly) q = q.where("is_active", "=", true);
  return q.orderBy("name", "asc").execute();
}

export async function findPlantById(id: number): Promise<PlantRow | undefined> {
  const row = await orgDb
    .selectFrom("plant")
    .selectAll()
    .where("plant_id", "=", id)
    .executeTakeFirst();
  return row ?? undefined;
}

export interface CreatePlantInput {
  code: string;
  name: string;
  address?: string | null;
  postal_code?: string | null;
}

export async function createPlant(input: CreatePlantInput): Promise<PlantRow> {
  const result = await orgDb
    .insertInto("plant")
    .values({
      code: input.code.trim(),
      name: input.name.trim(),
      address:
        typeof input.address === "string" && input.address.trim()
          ? input.address.trim()
          : null,
      postal_code:
        typeof input.postal_code === "string" && input.postal_code.trim()
          ? input.postal_code.trim()
          : null,
    })
    .output("inserted.plant_id")
    .executeTakeFirst();
  if (!result) throw new Error("Plant insert returned no identity");
  const row = await orgDb
    .selectFrom("plant")
    .selectAll()
    .where("plant_id", "=", result.plant_id)
    .executeTakeFirst();
  if (!row) throw new Error("Plant not found after insert");
  return row;
}

export interface UpdatePlantInput {
  code?: string;
  name?: string;
  address?: string | null;
  postal_code?: string | null;
  is_active?: boolean;
}

export async function updatePlant(
  id: number,
  input: UpdatePlantInput,
): Promise<void> {
  const changes: Partial<Insertable<Plant>> = { updated_at: new Date() };
  if (input.code !== undefined) {
    const trimmed = input.code.trim();
    if (trimmed) changes.code = trimmed;
  }
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (trimmed) changes.name = trimmed;
  }
  if (input.address !== undefined) {
    changes.address =
      typeof input.address === "string" && input.address.trim()
        ? input.address.trim()
        : null;
  }
  if (input.postal_code !== undefined) {
    changes.postal_code =
      typeof input.postal_code === "string" && input.postal_code.trim()
        ? input.postal_code.trim()
        : null;
  }
  if (input.is_active !== undefined) changes.is_active = input.is_active;
  await orgDb.updateTable("plant").set(changes).where("plant_id", "=", id).execute();
}

export async function deletePlant(id: number): Promise<void> {
  await orgDb.deleteFrom("plant").where("plant_id", "=", id).execute();
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export async function listDepartments(activeOnly = false): Promise<DepartmentRow[]> {
  let q = db.selectFrom("department").selectAll();
  if (activeOnly) q = q.where("is_active", "=", true);
  return q.orderBy("name", "asc").execute();
}

export interface CreateDepartmentInput {
  name: string;
  description?: string | null;
}

export async function createDepartment(
  input: CreateDepartmentInput,
): Promise<DepartmentRow> {
  const result = await db
    .insertInto("department")
    .values({
      name: input.name.trim(),
      description:
        typeof input.description === "string" && input.description.trim()
          ? input.description.trim()
          : null,
    })
    .output("inserted.department_id")
    .executeTakeFirst();
  if (!result) throw new Error("Department insert returned no identity");
  const row = await db
    .selectFrom("department")
    .selectAll()
    .where("department_id", "=", result.department_id)
    .executeTakeFirst();
  if (!row) throw new Error("Department not found after insert");
  return row;
}

export interface UpdateDepartmentInput {
  name?: string;
  description?: string | null;
  is_active?: boolean;
}

export async function updateDepartment(
  id: number,
  input: UpdateDepartmentInput,
): Promise<void> {
  const changes: Partial<Insertable<Department>> = { updated_at: new Date() };
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (trimmed) changes.name = trimmed;
  }
  if (input.description !== undefined) {
    changes.description =
      typeof input.description === "string" && input.description.trim()
        ? input.description.trim()
        : null;
  }
  if (input.is_active !== undefined) changes.is_active = input.is_active;
  await db
    .updateTable("department")
    .set(changes)
    .where("department_id", "=", id)
    .execute();
}

export async function deleteDepartment(id: number): Promise<void> {
  await db.deleteFrom("department").where("department_id", "=", id).execute();
}

// Re-export transaction type for callers that need it.
export type { Transaction };
export type { Role };