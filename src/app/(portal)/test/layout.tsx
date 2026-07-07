import { redirect } from "next/navigation";
import { assertAdminOrRedirect } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * Segment guard for the `/test/*` area: the portal's private component
 * proving ground. Deliberately OUTSIDE the nav registry (no `nav_section`,
 * no items — nothing renders in the sidebar) and admin-only, same check as
 * the Administración panel: modules park here while their practical use is
 * validated, without exposing them to portal users. First tenant: the
 * plant-layout module (plan plant-layout-foundation, re-scoped 2026-07-06).
 */
export default async function TestAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ok = await assertAdminOrRedirect();
  if (!ok) redirect("/");

  return children;
}
