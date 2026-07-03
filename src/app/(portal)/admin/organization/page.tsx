import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** `/admin/organization` lands on its first tab. */
export default function AdminOrganizationIndexPage() {
  redirect("/admin/organization/users");
}
