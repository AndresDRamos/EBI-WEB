import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route (admin-panel-regroup): Departamentos lives under Organización. */
export default function LegacyAdminDepartmentsPage() {
  redirect("/admin/organization/departments");
}
