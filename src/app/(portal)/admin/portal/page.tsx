import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** `/admin/portal` lands on the unified permission manager. */
export default function AdminPortalIndexPage() {
  redirect("/admin/portal/permissions");
}
