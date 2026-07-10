"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Factory, Pencil } from "lucide-react";
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
import { useCan } from "@/components/providers/permissions-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { apiMutate } from "@/lib/api-client";

export interface PlantRow {
  plant_id: number;
  code: string;
  name: string;
}

export interface ProcessRow {
  process_id: number;
  code: string;
  name: string;
}

export interface PlantProcessesPageProps {
  plants: PlantRow[];
  processes: ProcessRow[];
  /** All plant↔process links (both ids). */
  links: { plant_id: number; process_id: number }[];
}

/**
 * Procesos por planta — assigns which processes each plant runs (`org.plant_process`,
 * N:M). A process repeats freely across plants. The catalog is managed in the
 * "Procesos" tab; here you only toggle assignments. Editing PUTs the full set
 * for a plant; the API re-checks `org.plant_process:assign`.
 */
export function PlantProcessesPage({
  plants,
  processes,
  links,
}: PlantProcessesPageProps) {
  const can = useCan();
  const canAssign = can("org.plant_process:assign");
  const router = useRouter();

  const processById = React.useMemo(
    () => new Map(processes.map((p) => [p.process_id, p])),
    [processes],
  );
  const idsByPlant = React.useMemo(() => {
    const m = new Map<number, number[]>();
    for (const l of links) {
      const arr = m.get(l.plant_id) ?? [];
      arr.push(l.process_id);
      m.set(l.plant_id, arr);
    }
    return m;
  }, [links]);

  const [editPlant, setEditPlant] = React.useState<PlantRow | null>(null);
  const [selected, setSelected] = React.useState<number[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function openEdit(plant: PlantRow) {
    setSelected(idsByPlant.get(plant.plant_id) ?? []);
    setError(null);
    setEditPlant(plant);
  }

  async function onSave() {
    if (!editPlant) return;
    setError(null);
    setBusy(true);
    try {
      await apiMutate(`/api/org/plant-process/${editPlant.plant_id}`, {
        method: "PUT",
        body: { process_ids: selected },
        fallback: "No se pudieron guardar los procesos.",
      });
      setEditPlant(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Factory className="h-5 w-5 text-ezi-orange" />
        <div>
          <h2 className="text-lg font-semibold">Procesos por planta</h2>
          <p className="text-sm text-muted-foreground">
            Qué procesos ejecuta cada planta. Un mismo proceso puede asignarse a
            varias plantas. El catálogo se administra en la pestaña Procesos.
          </p>
        </div>
      </div>

      {plants.length === 0 ? (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          No hay plantas. Créalas en la pestaña Plantas.
        </p>
      ) : (
        <ul className="space-y-2">
          {plants.map((plant) => {
            const ids = idsByPlant.get(plant.plant_id) ?? [];
            const assigned = ids
              .map((id) => processById.get(id))
              .filter((p): p is ProcessRow => p !== undefined)
              .sort((a, b) => a.name.localeCompare(b.name, "es"));
            return (
              <li
                key={plant.plant_id}
                className="rounded-lg border bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{plant.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {plant.code}
                      </span>
                      <Badge variant="muted">{assigned.length}</Badge>
                    </div>
                    {assigned.length === 0 ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Sin procesos asignados.
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {assigned.map((p) => (
                          <Badge key={p.process_id} variant="outline">
                            {p.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  {canAssign ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(plant)}
                    >
                      <Pencil className="h-4 w-4" />
                      Editar procesos
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <EntityFormDialog
        open={editPlant !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditPlant(null);
            setError(null);
          }
        }}
        title={
          editPlant ? `Procesos de ${editPlant.name}` : "Procesos de la planta"
        }
        description="Marca los procesos que ejecuta esta planta."
        busy={busy}
        error={error}
        onSubmit={onSave}
        onCancel={() => setEditPlant(null)}
        submitLabel="Guardar procesos"
        sizeClassName="sm:max-w-lg"
      >
        {processes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay procesos en el catálogo. Créalos en la pestaña Procesos.
          </p>
        ) : (
          <div className="grid max-h-[50vh] gap-1 overflow-y-auto sm:grid-cols-2">
            {processes.map((p) => (
              <label
                key={p.process_id}
                className="flex items-start gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-gray-50"
              >
                <Checkbox
                  checked={selected.includes(p.process_id)}
                  disabled={busy}
                  onCheckedChange={(checked) => {
                    setSelected((prev) =>
                      checked
                        ? [...prev, p.process_id]
                        : prev.filter((id) => id !== p.process_id),
                    );
                  }}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">{p.name}</span>{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    {p.code}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </EntityFormDialog>
    </div>
  );
}
