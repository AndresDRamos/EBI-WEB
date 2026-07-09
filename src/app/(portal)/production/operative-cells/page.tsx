import { listCells } from "@/modules/production/db";
import { listPlants } from "@/modules/org/db/org";
import { listLocations } from "@/modules/org/db/locations";
import { listProcesses } from "@/modules/org/db/processes";
import {
  OperativeCellsPage,
  type LocationCardOption,
  type PlantTabOption,
} from "@/modules/production/components/operative-cells-page";
import type { OperativeCellRow } from "@/modules/production/components/location-cells-modal";

export const dynamic = "force-dynamic";

/** Celdas operativas — one unified catalog replacing the old Celdas/Líneas
 * table pages: plant tabs -> location cards -> operative cells of that
 * location. Action visibility is resolved client-side by `useCan`
 * (PermissionsProvider in the portal layout). */
export default async function OperativeCellsRoute() {
  const [cells, plants, locations, processes] = await Promise.all([
    listCells().catch(() => []),
    listPlants(true).catch(() => []),
    listLocations(true).catch(() => []),
    listProcesses(true).catch(() => []),
  ]);

  const plantOptions: PlantTabOption[] = plants.map((p) => ({
    plant_id: p.plant_id,
    code: p.code,
    name: p.name,
  }));
  const locationOptions: LocationCardOption[] = locations.map((l) => ({
    location_id: l.location_id,
    plant_id: l.plant_id,
    code: l.code,
    name: l.name,
  }));
  const cellRows: OperativeCellRow[] = cells.map((c) => ({
    cell_id: c.cell_id,
    code: c.code,
    name: c.name,
    location_id: c.location_id,
    location_name: c.location_name,
    plant_id: c.plant_id,
    plant_name: c.plant_name,
    parent_cell_id: c.parent_cell_id,
    sequence_in_parent: c.sequence_in_parent,
    size_x_m: c.size_x_m,
    size_y_m: c.size_y_m,
    process_id: c.process_id,
    process_name: c.process_name,
    child_count: c.child_count,
    current_asset_count: c.current_asset_count,
    is_active: c.is_active,
  }));

  return (
    <OperativeCellsPage
      plants={plantOptions}
      locations={locationOptions}
      cells={cellRows}
      processes={processes.map((p) => ({
        process_id: p.process_id,
        name: p.name,
      }))}
    />
  );
}
