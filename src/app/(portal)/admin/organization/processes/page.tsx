import { listProcesses } from "@/modules/org/db/processes";
import {
  ProcessesTablePage,
  type ProcessesTableRow,
} from "@/modules/org/components/processes-table-page";

export const dynamic = "force-dynamic";

/** Procesos tab (Organización) — company-wide process catalog (`org.process`).
 * Action visibility resolves client-side via `useCan`; the API re-checks. */
export default async function AdminProcessesPage() {
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
