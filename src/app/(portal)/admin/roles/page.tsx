import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route (admin-panel-regroup): roles merged into Departamentos y roles. */
export default function LegacyAdminRolesPage() {
  redirect("/admin/organization/departments");
}
