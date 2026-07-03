import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route (admin-panel-regroup): Usuarios lives under Organización. */
export default function LegacyAdminUsersPage() {
  redirect("/admin/organization/users");
}
