"use client";

import * as React from "react";
import { Link2, Unlink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageTabs } from "@/components/kit/page-tabs";
import { useCan } from "@/components/providers/permissions-provider";
import { apiMutate } from "@/lib/api-client";
import type { StationMappings, StationMappingRow, MappingStatus } from "@/modules/planning/db";

/** The registered mapping types. v1 ships one; each future `*_link` table adds
 * an entry with its own columns (the dropdown+table shell is generic). */
const MAPPING_TYPES = [
  { value: "laser_station", label: "Estaciones láser (EPS) ↔ Celdas (EBI)" },
] as const;

const STATUS_META: Record<MappingStatus, { label: string; variant: "success" | "warning" | "danger" }> = {
  mapped: { label: "Enlazado", variant: "success" },
  missing_portal: { label: "Falta en el portal", variant: "warning" },
  missing_legacy: { label: "Falta en EPS", variant: "danger" },
};

export function MigrationsPage({ initial }: { initial: StationMappings }) {
  const can = useCan();
  const canManage = can("planning.station_link:manage");
  const [mappingType, setMappingType] = React.useState<string>(MAPPING_TYPES[0].value);
  const [data, setData] = React.useState<StationMappings>(initial);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedCell, setSelectedCell] = React.useState<Record<number, number>>({});

  const refresh = React.useCallback(async () => {
    const fresh = await apiMutate<StationMappings>("/api/planning/station-links", { method: "GET" });
    setData(fresh);
  }, []);

  const link = async (row: StationMappingRow) => {
    const cellId = selectedCell[row.eps_station_id];
    if (!cellId) return;
    setBusyKey(`link-${row.eps_station_id}`);
    setError(null);
    try {
      await apiMutate("/api/planning/station-links", {
        body: { cell_id: cellId, eps_station_id: row.eps_station_id },
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusyKey(null);
    }
  };

  const unlink = async (row: StationMappingRow) => {
    if (!row.cell_station_link_id) return;
    setBusyKey(`unlink-${row.cell_station_link_id}`);
    setError(null);
    try {
      await apiMutate(`/api/planning/station-links/${row.cell_station_link_id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusyKey(null);
    }
  };

  // Every unmapped station that already has a cell picked in its dropdown.
  const pendingLinks = data.stations.filter(
    (r) => r.cell_station_link_id === null && Boolean(selectedCell[r.eps_station_id]),
  );

  /** Link the whole pending group in one click. Runs each link sequentially,
   * continues past individual failures (e.g. a cell picked twice → 1:1 clash)
   * and reports which ones could not be linked. */
  const linkAll = async () => {
    if (pendingLinks.length === 0) return;
    setBusyKey("link-all");
    setError(null);
    const failures: string[] = [];
    for (const row of pendingLinks) {
      try {
        await apiMutate("/api/planning/station-links", {
          body: { cell_id: selectedCell[row.eps_station_id], eps_station_id: row.eps_station_id },
        });
      } catch (err) {
        failures.push(
          `${row.station_description ?? `Estación ${row.eps_station_id}`}: ${err instanceof Error ? err.message : "error"}`,
        );
      }
    }
    await refresh();
    setBusyKey(null);
    if (failures.length > 0) setError(`No se pudieron enlazar: ${failures.join("; ")}`);
  };

  return (
    <div className="space-y-4">
      <PageTabs tabs={[{ href: "/admin/migrations", label: "Mapeos" }]} />

      <div className="flex flex-col gap-1">
        <label htmlFor="mapping-type" className="text-sm font-medium text-ezi-gray">
          Tipo de mapeo
        </label>
        <select
          id="mapping-type"
          value={mappingType}
          onChange={(e) => setMappingType(e.target.value)}
          className="w-full max-w-md rounded-md border bg-background px-3 py-2 text-sm"
        >
          {MAPPING_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Estación EPS</TableHead>
            <TableHead>Serie</TableHead>
            <TableHead>Celda EBI</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">
              {canManage ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busyKey !== null || pendingLinks.length === 0}
                  onClick={linkAll}
                  title="Enlaza todas las estaciones que ya tienen una celda seleccionada"
                >
                  <Link2 className="mr-1 h-3.5 w-3.5" />
                  Enlazar{pendingLinks.length > 0 ? ` (${pendingLinks.length})` : ""}
                </Button>
              ) : (
                "Acción"
              )}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.stations.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                No hay estaciones láser cargadas. Corre el ETL para poblar el catálogo.
              </TableCell>
            </TableRow>
          ) : (
            data.stations.map((row) => {
              const status = STATUS_META[row.status];
              const isLinked = row.cell_station_link_id !== null;
              return (
                <TableRow key={`${row.eps_station_id}-${row.cell_station_link_id ?? "none"}`}>
                  <TableCell>
                    <span className="font-medium text-ezi-gray">
                      {row.station_description ?? `Estación ${row.eps_station_id}`}
                    </span>
                    <span className="ml-1 text-xs text-muted-foreground">
                      (P{row.eps_plant_id}/R{row.eps_route_id}/E{row.eps_station_id})
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.serial_no ?? "—"}</TableCell>
                  <TableCell>
                    {isLinked ? (
                      <span className="text-sm">
                        <span className="font-mono text-ezi-gray">{row.cell_code}</span>
                        {row.cell_name && (
                          <span className="ml-1 text-muted-foreground">{row.cell_name}</span>
                        )}
                      </span>
                    ) : canManage && data.assignableCells.length > 0 ? (
                      <select
                        aria-label="Asignar celda"
                        value={selectedCell[row.eps_station_id] ?? ""}
                        onChange={(e) =>
                          setSelectedCell((s) => ({
                            ...s,
                            [row.eps_station_id]: Number(e.target.value),
                          }))
                        }
                        className="rounded-md border bg-background px-2 py-1 text-sm"
                      >
                        <option value="">Selecciona celda…</option>
                        {data.assignableCells.map((c) => (
                          <option key={c.cell_id} value={c.cell_id}>
                            {c.code} · {c.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {data.assignableCells.length === 0 ? "Sin celdas CL libres" : "—"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {canManage &&
                      (isLinked ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busyKey !== null}
                          onClick={() => unlink(row)}
                        >
                          <Unlink className="mr-1 h-3.5 w-3.5" />
                          Desenlazar
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={busyKey !== null || !selectedCell[row.eps_station_id]}
                          onClick={() => link(row)}
                        >
                          <Link2 className="mr-1 h-3.5 w-3.5" />
                          Enlazar
                        </Button>
                      ))}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
