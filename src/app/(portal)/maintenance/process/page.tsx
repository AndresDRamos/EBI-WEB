import { listProcesses } from "@/lib/db/maint";
import { isAdmin } from "@/lib/auth/rbac";
import {
  ProcessesTablePage,
  type ProcessesTableRow,
} from "@/components/maintenance/processes-table-page";

export const dynamic = "force-dynamic";

/** Procesos — manufacturing process catalog. */
export default async function ProcessesPage() {
  const [processes, canManage] = await Promise.all([
    listProcesses().catch(() => []),
    isAdmin(),
  ]);

  const rows: ProcessesTableRow[] = processes.map((p) => ({
    process_id: p.process_id,
    code: p.code,
    name: p.name,
    description: p.description,
    is_active: p.is_active,
  }));

  return <ProcessesTablePage processes={rows} canManage={canManage} />;
}
