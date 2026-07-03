import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route (admin-panel-regroup): Plantas lives under Organización. */
export default function LegacyAdminPlantsPage() {
  redirect("/admin/organization/plants");
}
