import "server-only";
import type { Selectable, Insertable } from "kysely";
import type { Location } from "@/lib/db/types";
import { orgDb } from "@/lib/db/schema-clients";

// `location` lives in the `org` schema (V18).

export type LocationRow = Selectable<Location>;

/** Location with its plant name resolved (both tables live in `org`). */
export type LocationWithPlant = LocationRow & { plant_name: string };

export async function listLocations(
  activeOnly = false,
): Promise<LocationWithPlant[]> {
  let q = orgDb
    .selectFrom("location")
    .innerJoin("plant", "plant.plant_id", "location.plant_id")
    .selectAll("location")
    .select("plant.name as plant_name");
  if (activeOnly) q = q.where("location.is_active", "=", true);
  return q
    .orderBy("plant.name", "asc")
    .orderBy("location.name", "asc")
    .execute();
}

export async function findLocationById(
  id: number,
): Promise<LocationRow | undefined> {
  const row = await orgDb
    .selectFrom("location")
    .selectAll()
    .where("location_id", "=", id)
    .executeTakeFirst();
  return row ?? undefined;
}

export interface CreateLocationInput {
  plant_id: number;
  code: string;
  name: string;
}

export async function createLocation(
  input: CreateLocationInput,
): Promise<LocationRow> {
  const result = await orgDb
    .insertInto("location")
    .values({
      plant_id: input.plant_id,
      code: input.code.trim(),
      name: input.name.trim(),
    })
    .output("inserted.location_id")
    .executeTakeFirst();
  if (!result) throw new Error("Location insert returned no identity");
  const row = await findLocationById(result.location_id);
  if (!row) throw new Error("Location not found after insert");
  return row;
}

export interface UpdateLocationInput {
  code?: string;
  name?: string;
  is_active?: boolean;
}

export async function updateLocation(
  id: number,
  input: UpdateLocationInput,
): Promise<void> {
  const changes: Partial<Insertable<Location>> = { updated_at: new Date() };
  if (input.code !== undefined && input.code.trim()) changes.code = input.code.trim();
  if (input.name !== undefined && input.name.trim()) changes.name = input.name.trim();
  if (input.is_active !== undefined) changes.is_active = input.is_active;
  await orgDb
    .updateTable("location")
    .set(changes)
    .where("location_id", "=", id)
    .execute();
}

/** Hard delete: 409s (FK) when an asset or a cell still references the location. */
export async function deleteLocation(id: number): Promise<void> {
  await orgDb.deleteFrom("location").where("location_id", "=", id).execute();
}
