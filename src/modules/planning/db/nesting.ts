import "server-only";
import { stagingDb, etlDb, SCOPE } from "./shared";

/**
 * Read layer over the ETL-landed `staging.*` laser-cut domain. Everything here
 * is READ-ONLY (staging is written exclusively by the on-prem ETL). Unit
 * heterogeneity is resolved HERE, never in staging: `cut_minutes` is minutes,
 * route-step `process_seconds`/`setup_seconds` are seconds.
 */

export interface NestingRow {
  eps_nesting_id: number;
  program_name: string | null;
  eps_station_id: number | null;
  station_description: string | null;
  plate_material_code: string | null;
  plate_material_name: string | null;
  plate_count: number | null;
  cut_minutes: number | null;
  eps_priority: number | null;
  eps_created_at: Date;
  material_requested_at: Date | null;
  material_issued_at: Date | null;
  started_at: Date | null;
}

export interface NestingComponentRow {
  eps_nesting_id: number;
  line_no: number;
  part_material_id: number;
  part_code: string | null;
  part_name: string | null;
  quantity: number | null;
}

export interface RouteStepRow {
  part_material_id: number;
  fabrication_order: number | null;
  eps_process_id: number | null;
  route_name: string | null;
  process_name: string | null;
  process_seconds: number | null;
  setup_seconds: number | null;
}

export interface CuttingStationRef {
  eps_station_id: number;
  description: string | null;
  available_hours: number | null;
}

export interface EntityFreshness {
  entity: string;
  status: string | null;
  finished_at: Date | null;
  rows_loaded: number | null;
}

/** All active laser stations in scope, keyed by EPS station id (station id is
 * unique within a plant/route). Used to resolve the EPS-suggested station badge
 * and the timeline's informational available-hours reference line. */
export async function cuttingStationRefs(): Promise<Map<number, CuttingStationRef>> {
  const rows = await stagingDb
    .selectFrom("eps_cutting_station")
    .select(["eps_station_id", "description", "available_hours"])
    .where("eps_plant_id", "=", SCOPE.plantId)
    .where("eps_route_id", "=", SCOPE.routeId)
    .where("is_deleted", "=", false)
    .execute();
  return new Map(rows.map((r) => [r.eps_station_id, r]));
}

/** The pending nestings (open window: not finished, not cancelled) in scope. */
export async function listOpenNestings(): Promise<NestingRow[]> {
  const [rows, stations] = await Promise.all([
    stagingDb
      .selectFrom("eps_nesting")
      .select([
        "eps_nesting_id",
        "program_name",
        "eps_station_id",
        "plate_material_code",
        "plate_material_name",
        "plate_count",
        "cut_minutes",
        "eps_priority",
        "eps_created_at",
        "material_requested_at",
        "material_issued_at",
        "started_at",
      ])
      .where("finished_at", "is", null)
      .where("is_deleted", "=", false)
      .where("eps_plant_id", "=", SCOPE.plantId)
      .where("eps_route_id", "=", SCOPE.routeId)
      .orderBy("eps_priority", "asc")
      .orderBy("eps_created_at", "asc")
      .execute(),
    cuttingStationRefs(),
  ]);
  return rows.map((r) => ({
    ...r,
    cut_minutes: r.cut_minutes === null ? null : Number(r.cut_minutes),
    station_description:
      r.eps_station_id !== null ? (stations.get(r.eps_station_id)?.description ?? null) : null,
  }));
}

/** Components (part lines) of the given nestings, ordered by nesting then line. */
export async function listNestingComponents(
  nestingIds: number[],
): Promise<NestingComponentRow[]> {
  if (nestingIds.length === 0) return [];
  return stagingDb
    .selectFrom("eps_nesting_detail")
    .select([
      "eps_nesting_id",
      "line_no",
      "part_material_id",
      "part_code",
      "part_name",
      "quantity",
    ])
    .where("eps_nesting_id", "in", nestingIds)
    .orderBy("eps_nesting_id", "asc")
    .orderBy("line_no", "asc")
    .execute();
}

/** Downstream route steps for the given parts, grouped by part and ordered by
 * fabrication order (10, 20, … 999 = shipping). */
export async function routeStepsByPart(
  partIds: number[],
): Promise<Map<number, RouteStepRow[]>> {
  const byPart = new Map<number, RouteStepRow[]>();
  if (partIds.length === 0) return byPart;
  const rows = await stagingDb
    .selectFrom("eps_part_route_step")
    .select([
      "part_material_id",
      "fabrication_order",
      "eps_process_id",
      "route_name",
      "process_name",
      "process_seconds",
      "setup_seconds",
    ])
    .where("part_material_id", "in", partIds)
    .orderBy("part_material_id", "asc")
    .orderBy("fabrication_order", "asc")
    .execute();
  for (const r of rows) {
    const list = byPart.get(r.part_material_id);
    if (list) list.push(r);
    else byPart.set(r.part_material_id, [r]);
  }
  return byPart;
}

/** Latest ETL run per entity (freshness indicator for the panel's stale warn). */
export async function etlFreshness(): Promise<EntityFreshness[]> {
  const rows = await etlDb
    .selectFrom("run_log")
    .select(["entity", "status", "finished_at", "rows_loaded"])
    .orderBy("run_id", "desc")
    .execute();
  const latest = new Map<string, EntityFreshness>();
  for (const r of rows) if (!latest.has(r.entity)) latest.set(r.entity, r);
  return [...latest.values()];
}

export interface LaserBacklog {
  nestings: NestingRow[];
  components: NestingComponentRow[];
  routeSteps: Record<number, RouteStepRow[]>;
  stations: CuttingStationRef[];
  freshness: EntityFreshness[];
}

/**
 * One structured payload for the backlog panel: open nestings + their
 * components + those components' downstream route + station catalog + ETL
 * freshness. The page/hook filters out nestings already placed in the visible
 * date's programs (that requires the date, which lives in the program layer).
 */
export async function getLaserBacklog(): Promise<LaserBacklog> {
  const [nestings, stations, freshness] = await Promise.all([
    listOpenNestings(),
    cuttingStationRefs(),
    etlFreshness(),
  ]);
  const components = await listNestingComponents(nestings.map((n) => n.eps_nesting_id));
  const partIds = [...new Set(components.map((c) => c.part_material_id))];
  const routeMap = await routeStepsByPart(partIds);
  return {
    nestings,
    components,
    routeSteps: Object.fromEntries(routeMap),
    stations: [...stations.values()],
    freshness,
  };
}
