"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Factory } from "lucide-react";
import {
  GroupedDataTable,
  type GroupedChildColumn,
} from "@/components/kit/grouped-data-table";
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface PlantGroupRow {
  plant_id: number;
  code: string;
  name: string;
  address: string | null;
  postal_code: string | null;
  is_active: boolean;
}

export interface LocationChildRow {
  location_id: number;
  plant_id: number;
  code: string;
  name: string;
  is_active: boolean;
}

/**
 * Plantas y ubicaciones — one grouped table: each plant is a group with its
 * locations ("Nave de producción 1", "Almacén de materia prima", …) as child
 * rows. Plant CRUD keeps the flat-table endpoints (/api/plants); location
 * CRUD goes to /api/org/locations (org.location:* permissions).
 */
export function PlantsLocationsPage({
  plants,
  locations,
}: {
  plants: PlantGroupRow[];
  locations: LocationChildRow[];
}) {
  const router = useRouter();

  // --- Plant modal state ---------------------------------------------------
  const [plantModal, setPlantModal] = React.useState<{
    open: boolean;
    editId: number | null;
  }>({ open: false, editId: null });
  const [plantCode, setPlantCode] = React.useState("");
  const [plantName, setPlantName] = React.useState("");
  const [plantAddress, setPlantAddress] = React.useState("");
  const [plantPostal, setPlantPostal] = React.useState("");
  const [plantError, setPlantError] = React.useState<string | null>(null);
  const [plantBusy, setPlantBusy] = React.useState(false);

  // --- Location modal state --------------------------------------------------
  const [locModal, setLocModal] = React.useState<{
    open: boolean;
    editId: number | null;
    plantId: number | null;
  }>({ open: false, editId: null, plantId: null });
  const [locCode, setLocCode] = React.useState("");
  const [locName, setLocName] = React.useState("");
  const [locError, setLocError] = React.useState<string | null>(null);
  const [locBusy, setLocBusy] = React.useState(false);

  const groups = React.useMemo(
    () => [...plants].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [plants],
  );
  const childrenOf = React.useCallback(
    (g: PlantGroupRow) => locations.filter((l) => l.plant_id === g.plant_id),
    [locations],
  );

  // --- Plant handlers --------------------------------------------------------

  function openCreatePlant() {
    setPlantCode("");
    setPlantName("");
    setPlantAddress("");
    setPlantPostal("");
    setPlantError(null);
    setPlantModal({ open: true, editId: null });
  }

  function openEditPlant(g: PlantGroupRow) {
    setPlantCode(g.code);
    setPlantName(g.name);
    setPlantAddress(g.address ?? "");
    setPlantPostal(g.postal_code ?? "");
    setPlantError(null);
    setPlantModal({ open: true, editId: g.plant_id });
  }

  async function onSubmitPlant() {
    setPlantError(null);
    if (!plantCode.trim() || !plantName.trim()) {
      setPlantError("Código y nombre son obligatorios.");
      return;
    }
    setPlantBusy(true);
    try {
      const id = plantModal.editId;
      const res = await fetch(id ? `/api/plants/${id}` : "/api/plants", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: plantCode.trim(),
          name: plantName.trim(),
          address: plantAddress.trim() || null,
          postal_code: plantPostal.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo guardar la planta.");
      }
      setPlantModal({ open: false, editId: null });
      router.refresh();
    } catch (err) {
      setPlantError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setPlantBusy(false);
    }
  }

  async function plantAction(
    g: PlantGroupRow,
    init: RequestInit,
    fallback: string,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/plants/${g.plant_id}`, init);
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: d.error ?? fallback };
    }
    router.refresh();
    return { ok: true };
  }

  // --- Location handlers ------------------------------------------------------

  function openCreateLoc(g: PlantGroupRow) {
    setLocCode("");
    setLocName("");
    setLocError(null);
    setLocModal({ open: true, editId: null, plantId: g.plant_id });
  }

  function openEditLoc(l: LocationChildRow) {
    setLocCode(l.code);
    setLocName(l.name);
    setLocError(null);
    setLocModal({ open: true, editId: l.location_id, plantId: l.plant_id });
  }

  async function onSubmitLoc() {
    setLocError(null);
    if (!locCode.trim() || !locName.trim()) {
      setLocError("Código y nombre son obligatorios.");
      return;
    }
    setLocBusy(true);
    try {
      const id = locModal.editId;
      const res = await fetch(
        id ? `/api/org/locations/${id}` : "/api/org/locations",
        {
          method: id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plant_id: locModal.plantId,
            code: locCode.trim(),
            name: locName.trim(),
          }),
        },
      );
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo guardar la ubicación.");
      }
      setLocModal({ open: false, editId: null, plantId: null });
      router.refresh();
    } catch (err) {
      setLocError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setLocBusy(false);
    }
  }

  async function locAction(
    l: LocationChildRow,
    init: RequestInit,
    fallback: string,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/org/locations/${l.location_id}`, init);
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: d.error ?? fallback };
    }
    router.refresh();
    return { ok: true };
  }

  const childColumns: GroupedChildColumn<LocationChildRow>[] = React.useMemo(
    () => [
      {
        key: "name",
        header: "Ubicación",
        render: (l) => <span className="font-medium">{l.name}</span>,
        className: "w-72",
      },
      {
        key: "code",
        header: "Código",
        render: (l) => <span className="font-mono text-xs">{l.code}</span>,
      },
    ],
    [],
  );

  const plantName_ = plants.find((p) => p.plant_id === locModal.plantId)?.name;

  return (
    <>
      <GroupedDataTable<PlantGroupRow, LocationChildRow>
        icon={Factory}
        title="Plantas y ubicaciones"
        subtitle="Cada planta agrupa sus ubicaciones físicas (naves de producción, almacenes…). Los equipos y las celdas de producción se localizan en una ubicación."
        groups={groups}
        getGroupId={(g) => g.plant_id}
        renderGroupTitle={(g) => (
          <span className="flex items-baseline gap-2">
            <span className="font-semibold">{g.name}</span>
            <span className="font-mono text-xs text-muted-foreground">{g.code}</span>
            {g.address ? (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {g.address}
              </span>
            ) : null}
          </span>
        )}
        groupIsActive={(g) => g.is_active}
        childrenOf={childrenOf}
        getChildId={(l) => l.location_id}
        childIsActive={(l) => l.is_active}
        childColumns={childColumns}
        childNoun="ubicación"
        childNounPlural="ubicaciones"
        onAddGroup={openCreatePlant}
        addGroupLabel="Nueva planta"
        onAddChild={openCreateLoc}
        addChildLabel="Agregar ubicación"
        onEditGroup={openEditPlant}
        onSoftDeleteGroup={(g) =>
          plantAction(
            g,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ is_active: false }),
            },
            "No se pudo desactivar la planta.",
          )
        }
        onHardDeleteGroup={(g) =>
          plantAction(
            g,
            { method: "DELETE" },
            "No se pudo eliminar la planta (¿tiene usuarios o ubicaciones asignados?).",
          )
        }
        onRestoreGroup={(g) =>
          plantAction(
            g,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ is_active: true }),
            },
            "No se pudo reactivar la planta.",
          )
        }
        onEditChild={openEditLoc}
        onSoftDeleteChild={(l) =>
          locAction(
            l,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ is_active: false }),
            },
            "No se pudo desactivar la ubicación.",
          )
        }
        onHardDeleteChild={(l) =>
          locAction(
            l,
            { method: "DELETE" },
            "No se pudo eliminar la ubicación (¿tiene equipos o celdas asignados?).",
          )
        }
        onRestoreChild={(l) =>
          locAction(
            l,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ is_active: true }),
            },
            "No se pudo reactivar la ubicación.",
          )
        }
        onAfterChange={() => router.refresh()}
      />

      <EntityFormDialog
        open={plantModal.open}
        onOpenChange={(open) => {
          setPlantModal((prev) => ({ open, editId: open ? prev.editId : null }));
          if (!open) setPlantError(null);
        }}
        title={plantModal.editId === null ? "Nueva planta" : "Editar planta"}
        busy={plantBusy}
        error={plantError}
        onSubmit={onSubmitPlant}
        onCancel={() => setPlantModal({ open: false, editId: null })}
        submitLabel={plantModal.editId === null ? "Crear planta" : "Guardar cambios"}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="plant-code">Código *</Label>
              <Input
                id="plant-code"
                value={plantCode}
                onChange={(e) => setPlantCode(e.target.value)}
                maxLength={32}
                disabled={plantBusy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plant-name">Nombre *</Label>
              <Input
                id="plant-name"
                value={plantName}
                onChange={(e) => setPlantName(e.target.value)}
                maxLength={160}
                disabled={plantBusy}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="plant-address">Dirección</Label>
            <Input
              id="plant-address"
              value={plantAddress}
              onChange={(e) => setPlantAddress(e.target.value)}
              maxLength={256}
              disabled={plantBusy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plant-postal">Código postal</Label>
            <Input
              id="plant-postal"
              value={plantPostal}
              onChange={(e) => setPlantPostal(e.target.value)}
              maxLength={16}
              disabled={plantBusy}
            />
          </div>
        </div>
      </EntityFormDialog>

      <EntityFormDialog
        open={locModal.open}
        onOpenChange={(open) => {
          setLocModal((prev) => ({
            open,
            editId: open ? prev.editId : null,
            plantId: open ? prev.plantId : null,
          }));
          if (!open) setLocError(null);
        }}
        title={locModal.editId === null ? "Nueva ubicación" : "Editar ubicación"}
        description={
          plantName_ ? `Ubicación dentro de ${plantName_}.` : undefined
        }
        busy={locBusy}
        error={locError}
        onSubmit={onSubmitLoc}
        onCancel={() => setLocModal({ open: false, editId: null, plantId: null })}
        submitLabel={locModal.editId === null ? "Crear ubicación" : "Guardar cambios"}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="loc-code">Código *</Label>
            <Input
              id="loc-code"
              value={locCode}
              onChange={(e) => setLocCode(e.target.value)}
              maxLength={32}
              disabled={locBusy}
              placeholder="p. ej. NAVE1"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="loc-name">Nombre *</Label>
            <Input
              id="loc-name"
              value={locName}
              onChange={(e) => setLocName(e.target.value)}
              maxLength={160}
              disabled={locBusy}
              placeholder="p. ej. Nave de producción 1"
            />
          </div>
        </div>
      </EntityFormDialog>
    </>
  );
}
