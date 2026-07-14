import { requireSectionOrRedirect } from "@/modules/navigation/guard";

/**
 * Segment guard for the Planeación module. A user reaches `/planning/*` only
 * if the `planning` nav section is visible for them (granted, or admin) — see
 * `requireSectionOrRedirect` / ADR 0008. The section ships dark (V20:
 * `is_active = 0`) and its pages are granted to `Planeador` / `Gerente de
 * planta` after activation.
 */
export const dynamic = "force-dynamic";

export default async function PlanningLayout({ children }: { children: React.ReactNode }) {
  await requireSectionOrRedirect("planning");
  return <>{children}</>;
}
