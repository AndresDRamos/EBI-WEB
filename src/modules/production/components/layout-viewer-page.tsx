"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Boxes, FileUp, Map, Move } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { apiMutate } from "@/lib/api-client";
import { useCan } from "@/components/providers/permissions-provider";
import { LayoutCanvas, type PlacedShape } from "./layout-canvas";
import { layoutStatusLabel } from "@/modules/production/enums";
import type { LayoutGeometry } from "@/modules/production/dxf/geometry";

export interface PlantOption {
  plant_id: number;
  name: string;
}

export interface ActiveLayoutView {
  layout_id: number;
  name: string;
  version: number;
  width_m: number;
  height_m: number;
  activated_at: string | null;
  geometry: LayoutGeometry;
}

export interface VersionRow {
  layout_id: number;
  version: number;
  name: string;
  status: string;
  created_at: string;
}

export interface LayoutViewerPageProps {
  plants: PlantOption[];
  plantId: number | null;
  layout: ActiveLayoutView | null;
  placements: PlacedShape[];
  versions: VersionRow[];
}

/** Active plant-layout viewer: SVG canvas + version history + entry points
 * to the import wizard and the placement editor (gated by `useCan`). */
export function LayoutViewerPage({
  plants,
  plantId,
  layout,
  placements,
  versions,
}: LayoutViewerPageProps) {
  const can = useCan();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function switchPlant(id: string) {
    router.push(id ? `/test/layout?plant=${id}` : "/test/layout");
  }

  async function onArchive() {
    if (!layout) return;
    if (
      !window.confirm(
        "¿Archivar el layout activo sin reemplazo? Las colocaciones vigentes se cerrarán.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await apiMutate(`/api/production/layouts/${layout.layout_id}/archive`, {
        fallback: "No se pudo archivar el layout.",
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Map className="h-6 w-6 text-[#ff5c35]" />
          <div>
            <h1 className="text-xl font-semibold">Layout de planta</h1>
            <p className="text-sm text-muted-foreground">
              Plano digitalizado desde DXF (contrato CAD EBI-*), con la
              posición física vigente de los equipos.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {plants.length > 1 ? (
            <Select
              value={plantId ? String(plantId) : ""}
              onChange={(e) => switchPlant(e.target.value)}
              className="w-44"
              aria-label="Planta"
            >
              {plants.map((p) => (
                <option key={p.plant_id} value={p.plant_id}>
                  {p.name}
                </option>
              ))}
            </Select>
          ) : null}
          <Link
            href="/test/footprints"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <Boxes className="mr-2 h-4 w-4" />
            Huellas
          </Link>
          {layout && can("production.placement:create") ? (
            <Link
              href={`/test/layout/edit?plant=${plantId ?? ""}`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <Move className="mr-2 h-4 w-4" />
              Editar colocaciones
            </Link>
          ) : null}
          {layout && can("production.layout:archive") ? (
            <Button variant="outline" onClick={onArchive} disabled={busy}>
              <Archive className="mr-2 h-4 w-4" />
              Archivar
            </Button>
          ) : null}
          {can("production.layout:create") ? (
            <Link
              href="/test/layout/import"
              className={cn(buttonVariants())}
            >
              <FileUp className="mr-2 h-4 w-4" />
              Importar DXF
            </Link>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {layout ? (
        <>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{layout.name}</span>
            <Badge variant="secondary">v{layout.version} · activo</Badge>
            <span>
              {layout.width_m} × {layout.height_m} m
            </span>
            <span>{placements.length} equipos colocados</span>
          </div>
          <div className="h-[70vh] rounded-lg border border-border bg-white">
            <LayoutCanvas geometry={layout.geometry} placements={placements} />
          </div>
        </>
      ) : (
        <div className="flex h-[40vh] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border text-center">
          <Map className="h-10 w-10 text-muted-foreground" />
          <p className="max-w-md text-sm text-muted-foreground">
            Esta planta aún no tiene un layout activo. Importa el DXF calcado
            con las capas EBI-* para digitalizar el piso.
          </p>
          {can("production.layout:create") ? (
            <Link
              href="/test/layout/import"
              className={cn(buttonVariants())}
            >
              <FileUp className="mr-2 h-4 w-4" />
              Importar DXF
            </Link>
          ) : null}
        </div>
      )}

      {versions.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Historial de versiones
          </h2>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Versión</th>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Creado</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.layout_id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono">v{v.version}</td>
                    <td className="px-3 py-2">{v.name}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={v.status === "active" ? "default" : "secondary"}
                      >
                        {layoutStatusLabel(v.status)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(v.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
