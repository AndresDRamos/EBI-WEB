import { requireSectionOrRedirect } from "@/modules/navigation/guard";

/**
 * Segment guard for the Producción module. A user reaches `/production/*`
 * only if the `production` nav section is visible for them (granted, or
 * admin) — see `requireSectionOrRedirect` / ADR 0005. Denied users land on
 * the home page. This is the page-authorization contract every module's
 * segment layout applies (module blueprint §5).
 */
export const dynamic = "force-dynamic";

export default async function ProductionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSectionOrRedirect("production");
  return <>{children}</>;
}
