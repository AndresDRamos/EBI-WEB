import { getLaserBacklog, listSequencingCells } from "@/modules/planning/db";
import { LaserSequencingPage } from "@/modules/planning/components/laser-sequencing-page";
import { computeStaleWarning } from "@/modules/planning/format";

export const dynamic = "force-dynamic";

/** Secuenciación láser — Plant 1 nesting backlog + per-machine sequence
 * programs. The backlog (open EPS nestings) and the mapped laser cells load
 * server-side; the client fetches each date's programs via the API. Action
 * visibility is resolved client-side by `useCan` (PermissionsProvider in the
 * portal layout). */
export default async function LaserSequencingRoute() {
  const [backlog, cells] = await Promise.all([
    getLaserBacklog().catch(() => ({
      nestings: [],
      components: [],
      routeSteps: {},
      stations: [],
      freshness: [],
    })),
    listSequencingCells().catch(() => []),
  ]);

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const staleWarning = computeStaleWarning(backlog.freshness, now.getTime());

  return (
    <LaserSequencingPage
      backlog={backlog}
      cells={cells}
      today={today}
      staleWarning={staleWarning}
    />
  );
}
