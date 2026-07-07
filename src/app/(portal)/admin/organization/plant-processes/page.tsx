import { listPlants } from "@/modules/org/db/org";
import { listProcesses } from "@/modules/org/db/processes";
import { listPlantProcessLinks } from "@/modules/org/db/plant-process";
import {
  PlantProcessesPage,
  type PlantRow,
  type ProcessRow,
} from "@/modules/org/components/plant-processes-page";

export const dynamic = "force-dynamic";

/** Procesos por planta tab (Organización) — assigns `org.plant_process` (N:M).
 * The catalog CRUD lives in the Procesos tab; here you toggle assignments. */
export default async function AdminPlantProcessesPage() {
  const [plants, processes, links] = await Promise.all([
    listPlants(true).catch(() => []),
    listProcesses(true).catch(() => []),
    listPlantProcessLinks().catch(() => []),
  ]);

  const plantRows: PlantRow[] = plants.map((p) => ({
    plant_id: p.plant_id,
    code: p.code,
    name: p.name,
  }));
  const processRows: ProcessRow[] = processes.map((p) => ({
    process_id: p.process_id,
    code: p.code,
    name: p.name,
  }));

  return (
    <PlantProcessesPage
      plants={plantRows}
      processes={processRows}
      links={links.map((l) => ({ plant_id: l.plant_id, process_id: l.process_id }))}
    />
  );
}
