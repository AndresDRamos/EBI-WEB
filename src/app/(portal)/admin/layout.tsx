import { redirect } from "next/navigation";
import { assertAdminOrRedirect } from "@/lib/auth/rbac";
import { AdminPanelSidebar } from "@/components/admin/admin-panel-sidebar";

export const dynamic = "force-dynamic";

/**
 * Nested layout for the Administración panel. Runs one admin check for all sub
 * routes (non-admins land here and bounce to /dashboards). PortalShell keeps
 * the global header (logo + avatar menu) and hides the global left sidebar when
 * the path starts with `/admin`, so this layout supplies its own panel sidebar
 * beside the page content (no double rail).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ok = await assertAdminOrRedirect();
  if (!ok) redirect("/dashboards");

  return (
    <div className="flex gap-4">
      <AdminPanelSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}