import { requireSectionOrRedirect } from "@/modules/navigation/guard";

/**
 * Segment guard for the Mantenimiento module. A user reaches `/maintenance/*`
 * only if the `maintenance` nav section is visible for them (granted, or
 * admin) — see `requireSectionOrRedirect` / ADR 0005. Denied users land on
 * the home page. This is the page-authorization contract every module's
 * segment layout applies (module blueprint §5).
 */
export const dynamic = "force-dynamic";

export default async function MaintenanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSectionOrRedirect("maintenance");
  return <>{children}</>;
}
