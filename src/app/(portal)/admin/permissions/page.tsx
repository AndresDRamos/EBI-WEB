import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route (admin-panel-regroup): permissions live under Portal → Permisos. */
export default function LegacyAdminPermissionsPage() {
  redirect("/admin/portal/permissions");
}
