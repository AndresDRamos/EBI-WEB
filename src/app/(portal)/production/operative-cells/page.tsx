import { listCells, toOperativeCellRow } from "@/modules/production/db";
import { listPlants } from "@/modules/org/db/org";
import { listLocations } from "@/modules/org/db/locations";
import { listProcesses } from "@/modules/org/db/processes";
import {
  OperativeCellsPage,
  type LocationCardOption,
  type PlantTabOption,
} from "@/modules/production/components/operative-cells-page";

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
  const cellRows = cells.map(toOperativeCellRow);

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
