import "server-only";
import { db } from "./client";
import type { Selectable } from "kysely";
import type { AppUser } from "./types";

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