import { listCells, listLines } from "@/modules/production/db";
import { listPlants } from "@/modules/org/db/org";
import { listLocations } from "@/modules/org/db/locations";
import {
  CellsTablePage,
  type CellsTableRow,
} from "@/modules/production/components/cells-table-page";

export const dynamic = "force-dynamic";

/** Celdas — production cell catalog. Action visibility is resolved
 * client-side by `useCan` (PermissionsProvider in the portal layout). */
export default async function CellsPage() {
  const [cells, plants, locations, lines] = await Promise.all([
    listCells().catch(() => []),
    listPlants(true).catch(() => []),
    listLocations(true).catch(() => []),
    listLines(true).catch(() => []),
  ]);

  const rows: CellsTableRow[] = cells.map((c) => ({
    cell_id: c.cell_id,
    code: c.code,
    name: c.name,
    plant_id: c.plant_id,
    plant_name: c.plant_name,
    location_id: c.location_id,
    location_name: c.location_name,
    line_id: c.line_id,
    line_code: c.line_code,
    line_name: c.line_name,
    sequence_in_line: c.sequence_in_line,
    current_asset_count: c.current_asset_count,
    is_active: c.is_active,
  }));

  return (
    <CellsTablePage
      cells={rows}
      plants={plants.map((p) => ({ plant_id: p.plant_id, name: p.name }))}
      locations={locations.map((l) => ({
        location_id: l.location_id,
        plant_id: l.plant_id,
        name: l.name,
      }))}
      lines={lines.map((l) => ({
        line_id: l.line_id,
        code: l.code,
        name: l.name,
      }))}
    />
  );
}
