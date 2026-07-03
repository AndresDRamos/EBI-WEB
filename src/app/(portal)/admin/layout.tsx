import { redirect } from "next/navigation";
import { assertAdminOrRedirect } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * Nested layout for the Administración panel. Runs one admin check for all sub
 * routes (non-admins bounce to the home landing). The panel sidebar is
 * rendered by `PortalShell` (the code-built `ADMIN_NAV_SECTION` via the shared
 * `PortalSidebar` under `/admin/*`), so this layout only guards and wraps the
 * page content — no bespoke rail.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ok = await assertAdminOrRedirect();
  if (!ok) redirect("/");

  return children;
}