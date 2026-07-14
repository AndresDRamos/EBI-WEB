import "server-only";
import { productionDb } from "@/lib/db/schema-clients";
import { db, stagingDb, SCOPE, laserProcessId } from "./shared";

/**
 * EBI cell ↔ EPS laser-station mapping (Admin → Migraciones). 1:1 both ways.
 * Reads span three schemas (`staging` stations, `planning` links,
 * `production` cells) merged in JS — a typed cross-schema join is not
 * expressible with the flattened codegen keys. Sizes (~9 stations, 2 cells)
 * make this a non-issue.
 */

export type MappingStatus = "mapped" | "missing_portal" | "missing_legacy";

export interface StationMappingRow {
  eps_plant_id: number;
  eps_route_id: number;
  eps_station_id: number;
  station_description: string | null;
  serial_no: string | null;
  cell_station_link_id: number | null;
  cell_id: number | null;
  cell_code: string | null;
  cell_name: string | null;
  status: MappingStatus;
}

export interface AssignableCell {
  cell_id: number;
  code: string;
  name: string;
}

export interface StationMappings {
  stations: StationMappingRow[];
  assignableCells: AssignableCell[];
}

// ---------------------------------------------------------------------------
// Typed errors (API maps to 4xx)
// ---------------------------------------------------------------------------
export class CellAlreadyLinkedError extends Error {
  constructor() {
    super("Esta celda ya está enlazada a una estación.");
    this.name = "CellAlreadyLinkedError";
  }
}
export class StationAlreadyLinkedError extends Error {
  constructor() {
    super("Esta estación ya está enlazada a una celda.");
    this.name = "StationAlreadyLinkedError";
  }
}
export class CellNotAssignableError extends Error {
  constructor() {
    super("La celda no existe, está inactiva o no es de proceso Corte láser.");
    this.name = "CellNotAssignableError";
  }
}
export class LinkNotFoundError extends Error {
  constructor() {
    super("El enlace no existe.");
    this.name = "LinkNotFoundError";
  }
}

export interface SequencingCell {
  cell_id: number;
  cell_code: string;
  cell_name: string;
  eps_station_id: number;
  station_description: string | null;
  available_hours: number | null;
}

/** The laser cells that back the timeline rows: every mapped cell (has a
 * station link), enriched with its EPS station's description and (informational)
 * available hours. Ordered by cell code. */
export async function listSequencingCells(): Promise<SequencingCell[]> {
  const links = await db
    .selectFrom("cell_station_link")
    .select(["cell_id", "eps_plant_id", "eps_route_id", "eps_station_id"])
    .where("eps_plant_id", "=", SCOPE.plantId)
    .where("eps_route_id", "=", SCOPE.routeId)
    .execute();
  if (links.length === 0) return [];

  const [cells, stations] = await Promise.all([
    productionDb
      .selectFrom("cell")
      .select(["cell_id", "code", "name"])
      .where("cell_id", "in", links.map((l) => l.cell_id))
      .execute(),
    stagingDb
      .selectFrom("eps_cutting_station")
      .select(["eps_station_id", "description", "available_hours"])
      .where("eps_plant_id", "=", SCOPE.plantId)
      .where("eps_route_id", "=", SCOPE.routeId)
      .execute(),
  ]);
  const cellById = new Map(cells.map((c) => [c.cell_id, c]));
  const stationById = new Map(stations.map((s) => [s.eps_station_id, s]));

  return links
    .map((l) => {
      const cell = cellById.get(l.cell_id);
      const station = stationById.get(l.eps_station_id);
      return {
        cell_id: l.cell_id,
        cell_code: cell?.code ?? "",
        cell_name: cell?.name ?? "",
        eps_station_id: l.eps_station_id,
        station_description: station?.description ?? null,
        available_hours:
          station?.available_hours === null || station?.available_hours === undefined
            ? null
            : Number(station.available_hours),
      };
    })
    .sort((a, b) => a.cell_code.localeCompare(b.cell_code));
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export async function listStationMappings(): Promise<StationMappings> {
  const [stations, links, processId] = await Promise.all([
    stagingDb
      .selectFrom("eps_cutting_station")
      .select(["eps_plant_id", "eps_route_id", "eps_station_id", "description", "serial_no"])
      .where("eps_plant_id", "=", SCOPE.plantId)
      .where("eps_route_id", "=", SCOPE.routeId)
      .where("is_deleted", "=", false)
      .orderBy("eps_station_id", "asc")
      .execute(),
    db
      .selectFrom("cell_station_link")
      .select([
        "cell_station_link_id",
        "cell_id",
        "eps_plant_id",
        "eps_route_id",
        "eps_station_id",
      ])
      .where("eps_plant_id", "=", SCOPE.plantId)
      .where("eps_route_id", "=", SCOPE.routeId)
      .execute(),
    laserProcessId(),
  ]);

  const cellIds = [...new Set(links.map((l) => l.cell_id))];
  const cells =
    cellIds.length > 0
      ? await productionDb
          .selectFrom("cell")
          .select(["cell_id", "code", "name"])
          .where("cell_id", "in", cellIds)
          .execute()
      : [];
  const cellById = new Map(cells.map((c) => [c.cell_id, c]));
  const linkByStation = new Map(links.map((l) => [l.eps_station_id, l]));
  const linkedCellIds = new Set(links.map((l) => l.cell_id));

  const stationRows: StationMappingRow[] = stations.map((s) => {
    const link = linkByStation.get(s.eps_station_id);
    const cell = link ? cellById.get(link.cell_id) : undefined;
    return {
      eps_plant_id: s.eps_plant_id,
      eps_route_id: s.eps_route_id,
      eps_station_id: s.eps_station_id,
      station_description: s.description,
      serial_no: s.serial_no,
      cell_station_link_id: link?.cell_station_link_id ?? null,
      cell_id: link?.cell_id ?? null,
      cell_code: cell?.code ?? null,
      cell_name: cell?.name ?? null,
      status: link ? "mapped" : "missing_portal",
    };
  });

  // Orphan links: a link whose EPS station is no longer landed in staging.
  const stationIds = new Set(stations.map((s) => s.eps_station_id));
  for (const l of links) {
    if (stationIds.has(l.eps_station_id)) continue;
    const cell = cellById.get(l.cell_id);
    stationRows.push({
      eps_plant_id: l.eps_plant_id,
      eps_route_id: l.eps_route_id,
      eps_station_id: l.eps_station_id,
      station_description: null,
      serial_no: null,
      cell_station_link_id: l.cell_station_link_id,
      cell_id: l.cell_id,
      cell_code: cell?.code ?? null,
      cell_name: cell?.name ?? null,
      status: "missing_legacy",
    });
  }

  // Assignable cells: active CL-process cells not already linked.
  let assignableCells: AssignableCell[] = [];
  if (processId !== null) {
    const cells = await productionDb
      .selectFrom("cell")
      .select(["cell_id", "code", "name"])
      .where("process_id", "=", processId)
      .where("is_active", "=", true)
      .orderBy("code", "asc")
      .execute();
    assignableCells = cells.filter((c) => !linkedCellIds.has(c.cell_id));
  }

  return { stations: stationRows, assignableCells };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
export interface LinkInput {
  cell_id: number;
  eps_station_id: number;
}

/** Link a CL cell to an EPS station (both must be currently unlinked). The DB
 * enforces 1:1 with UNIQUE constraints; this pre-checks for friendly errors. */
export async function linkStationToCell(input: LinkInput): Promise<number> {
  const processId = await laserProcessId();
  const cell =
    processId === null
      ? undefined
      : await productionDb
          .selectFrom("cell")
          .select("cell_id")
          .where("cell_id", "=", input.cell_id)
          .where("process_id", "=", processId)
          .where("is_active", "=", true)
          .executeTakeFirst();
  if (!cell) throw new CellNotAssignableError();

  const station = await stagingDb
    .selectFrom("eps_cutting_station")
    .select("eps_station_id")
    .where("eps_plant_id", "=", SCOPE.plantId)
    .where("eps_route_id", "=", SCOPE.routeId)
    .where("eps_station_id", "=", input.eps_station_id)
    .where("is_deleted", "=", false)
    .executeTakeFirst();
  if (!station) throw new LinkNotFoundError();

  const existing = await db
    .selectFrom("cell_station_link")
    .select(["cell_id", "eps_station_id"])
    .where((eb) =>
      eb.or([
        eb("cell_id", "=", input.cell_id),
        eb.and([
          eb("eps_plant_id", "=", SCOPE.plantId),
          eb("eps_route_id", "=", SCOPE.routeId),
          eb("eps_station_id", "=", input.eps_station_id),
        ]),
      ]),
    )
    .execute();
  if (existing.some((e) => e.cell_id === input.cell_id)) throw new CellAlreadyLinkedError();
  if (existing.some((e) => e.eps_station_id === input.eps_station_id))
    throw new StationAlreadyLinkedError();

  const inserted = await db
    .insertInto("cell_station_link")
    .values({
      cell_id: input.cell_id,
      eps_plant_id: SCOPE.plantId,
      eps_route_id: SCOPE.routeId,
      eps_station_id: input.eps_station_id,
    })
    .output("inserted.cell_station_link_id")
    .executeTakeFirst();
  if (!inserted) throw new Error("Link insert returned no identity");
  return inserted.cell_station_link_id;
}

/** Remove a mapping by its link id. */
export async function unlinkStation(linkId: number): Promise<void> {
  const link = await db
    .selectFrom("cell_station_link")
    .select("cell_station_link_id")
    .where("cell_station_link_id", "=", linkId)
    .executeTakeFirst();
  if (!link) throw new LinkNotFoundError();
  await db.deleteFrom("cell_station_link").where("cell_station_link_id", "=", linkId).execute();
}
