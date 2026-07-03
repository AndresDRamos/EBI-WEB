import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** `/admin/portal` lands on its first tab. */
export default function AdminPortalIndexPage() {
  redirect("/admin/portal/modules");
}
