import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * `/admin` redirects to the Usuarios sub-page — there is no overview page yet.
 */
export default function AdminIndexPage() {
  redirect("/admin/users");
}