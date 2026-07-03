import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route (admin-panel-regroup): the nav registry lives under Portal → Módulos. */
export default function LegacyAdminAccessPage() {
  redirect("/admin/portal/modules");
}
