import { listStationMappings } from "@/modules/planning/db";
import { MigrationsPage } from "@/modules/planning/components/migrations-page";

export const dynamic = "force-dynamic";

/**
 * Admin → Migraciones. A generic mapping-type dropdown + table shell; v1 has
 * one type: EPS laser stations ↔ EBI cells (`planning.cell_station_link`).
 * Admin-only via the parent `admin/layout.tsx` guard; the link/unlink
 * mutations are additionally gated by `planning.station_link:manage`.
 */
export default async function AdminMigrationsRoute() {
  const initial = await listStationMappings().catch(() => ({
    stations: [],
    assignableCells: [],
  }));

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Migraciones</h1>
        <p className="text-sm text-muted-foreground">
          Mapeos entre datos heredados de EPS y catálogos del portal.
        </p>
      </header>
      <MigrationsPage initial={initial} />
    </div>
  );
}
