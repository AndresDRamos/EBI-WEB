import { listProcesses } from "@/modules/maintenance/db";
import {
  ProcessesTablePage,
  type ProcessesTableRow,
} from "@/modules/maintenance/components/processes-table-page";

export const dynamic = "force-dynamic";

/** Procesos — manufacturing process catalog. Action visibility is resolved
 * client-side by `useCan` (PermissionsProvider in the portal layout). */
export default async function ProcessesPage() {
  const processes = await listProcesses().catch(() => []);

  const rows: ProcessesTableRow[] = processes.map((p) => ({
    process_id: p.process_id,
    code: p.code,
    name: p.name,
    description: p.description,
    is_active: p.is_active,
  }));

  return <ProcessesTablePage processes={rows} />;
}
