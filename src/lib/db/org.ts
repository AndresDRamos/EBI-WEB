import "server-only";
import { db as rootDb } from "./client";
import type { Selectable, Insertable, Transaction } from "kysely";
import type { Plant, Department, Role } from "./types";

// All tables here (role, plant, department) live in the `auth` schema. See the
// note in users.ts: kysely-codegen dropped the schema from the generated keys,
// so bind the client to `auth` or SQL Server looks under dbo and 208s.
const db = rootDb.withSchema("auth");

export type PlantRow = Selectable<Plant>;
export type DepartmentRow = Selectable<Department>;
export type RoleRow = Selectable<Role>;

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export async function listRoles(): Promise<RoleRow[]> {
  return db
    .selectFrom("role")
    .selectAll()
    .orderBy("name", "asc")
    .execute();
}

// ---------------------------------------------------------------------------
// Plants
// ---------------------------------------------------------------------------

export async function listPlants(activeOnly = false): Promise<PlantRow[]> {
  let q = db.selectFrom("plant").selectAll();
  if (activeOnly) q = q.where("is_active", "=", true);
  return q.orderBy("name", "asc").execute();
}

export async function createPlant(
  code: string,
  name: string,
): Promise<PlantRow> {
  const result = await db
    .insertInto("plant")
    .values({ code, name })
    .executeTakeFirst();
  const id = Number(result.insertId);
  const row = await db
    .selectFrom("plant")
    .selectAll()
    .where("plant_id", "=", id)
    .executeTakeFirst();
  if (!row) throw new Error("Plant not found after insert");
  return row;
}

export async function updatePlant(
  id: number,
  input: { code?: string; name?: string; is_active?: boolean },
): Promise<void> {
  const changes: Partial<Insertable<Plant>> = { updated_at: new Date() };
  if (input.code !== undefined) changes.code = input.code;
  if (input.name !== undefined) changes.name = input.name;
  if (input.is_active !== undefined) changes.is_active = input.is_active;
  await db.updateTable("plant").set(changes).where("plant_id", "=", id).execute();
}

export async function deletePlant(id: number): Promise<void> {
  await db.deleteFrom("plant").where("plant_id", "=", id).execute();
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export async function listDepartments(activeOnly = false): Promise<DepartmentRow[]> {
  let q = db.selectFrom("department").selectAll();
  if (activeOnly) q = q.where("is_active", "=", true);
  return q.orderBy("name", "asc").execute();
}

export async function createDepartment(name: string): Promise<DepartmentRow> {
  const result = await db
    .insertInto("department")
    .values({ name })
    .executeTakeFirst();
  const id = Number(result.insertId);
  const row = await db
    .selectFrom("department")
    .selectAll()
    .where("department_id", "=", id)
    .executeTakeFirst();
  if (!row) throw new Error("Department not found after insert");
  return row;
}

export async function updateDepartment(
  id: number,
  input: { name?: string; is_active?: boolean },
): Promise<void> {
  const changes: Partial<Insertable<Department>> = { updated_at: new Date() };
  if (input.name !== undefined) changes.name = input.name;
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