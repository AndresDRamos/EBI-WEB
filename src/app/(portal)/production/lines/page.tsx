import { listLines } from "@/modules/production/db";
import { listPlants } from "@/modules/org/db/org";
import {
  LinesTablePage,
  type LinesTableRow,
} from "@/modules/production/components/lines-table-page";

export const dynamic = "force-dynamic";

/** Líneas — production line catalog. Action visibility is resolved
 * client-side by `useCan` (PermissionsProvider in the portal layout). */
export default async function LinesPage() {
  const [lines, plants] = await Promise.all([
    listLines().catch(() => []),
    listPlants(true).catch(() => []),
  ]);

  const rows: LinesTableRow[] = lines.map((l) => ({
    line_id: l.line_id,
    code: l.code,
    name: l.name,
    plant_id: l.plant_id,
    plant_name: l.plant_name,
    cell_count: l.cell_count,
    is_active: l.is_active,
  }));

  return (
    <LinesTablePage
      lines={rows}
      plants={plants.map((p) => ({ plant_id: p.plant_id, name: p.name }))}
    />
  );
}
