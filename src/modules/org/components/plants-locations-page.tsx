"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Factory } from "lucide-react";
import {
  GroupedDataTable,
  type GroupedChildColumn,
} from "@/components/kit/grouped-data-table";
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
import { useEntityCrud } from "@/components/kit/use-entity-crud";
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

  const plantCrud = useEntityCrud<PlantGroupRow>({
    basePath: "/api/plants",
    getId: (p) => p.plant_id,
  });
  const locCrud = useEntityCrud<LocationChildRow, { plantId: number }>({
    basePath: "/api/org/locations",
    getId: (l) => l.location_id,
  });

  // --- Plant form fields -------------------------------------------------
  const [plantCode, setPlantCode] = React.useState("");
  const [plantName, setPlantName] = React.useState("");
  const [plantAddress, setPlantAddress] = React.useState("");
  const [plantPostal, setPlantPostal] = React.useState("");

  // --- Location form fields -----------------------------------------------
  const [locCode, setLocCode] = React.useState("");
  const [locName, setLocName] = React.useState("");

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
    plantCrud.openCreate();
  }

  function openEditPlant(g: PlantGroupRow) {
    setPlantCode(g.code);
    setPlantName(g.name);
    setPlantAddress(g.address ?? "");
    setPlantPostal(g.postal_code ?? "");
    plantCrud.openEdit(g);
  }

  async function onSubmitPlant() {
    if (!plantCode.trim() || !plantName.trim()) {
      plantCrud.setError("Código y nombre son obligatorios.");
      return;
    }
    const ok = await plantCrud.submit(
      {
        code: plantCode.trim(),
        name: plantName.trim(),
        address: plantAddress.trim() || null,
        postal_code: plantPostal.trim() || null,
      },
      "No se pudo guardar la planta.",
    );
    if (ok) {
      setPlantCode("");
      setPlantName("");
      setPlantAddress("");
      setPlantPostal("");
    }
  }

  // --- Location handlers ------------------------------------------------------

  function openCreateLoc(g: PlantGroupRow) {
    setLocCode("");
    setLocName("");
    locCrud.openCreate({ plantId: g.plant_id });
  }

  function openEditLoc(l: LocationChildRow) {
    setLocCode(l.code);
    setLocName(l.name);
    locCrud.openEdit(l, { plantId: l.plant_id });
  }

  async function onSubmitLoc() {
    if (!locCode.trim() || !locName.trim()) {
      locCrud.setError("Código y nombre son obligatorios.");
      return;
    }
    const ok = await locCrud.submit(
      {
        plant_id: locCrud.modalState.extra?.plantId,
        code: locCode.trim(),
        name: locName.trim(),
      },
      "No se pudo guardar la ubicación.",
    );
    if (ok) {
      setLocCode("");
      setLocName("");
    }
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

  const plantName_ = plants.find(
    (p) => p.plant_id === locCrud.modalState.extra?.plantId,
  )?.name;

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
          plantCrud.onSoftDelete(g, "No se pudo desactivar la planta.")
        }
        onHardDeleteGroup={(g) =>
          plantCrud.onHardDelete(
            g,
            "No se pudo eliminar la planta (¿tiene usuarios o ubicaciones asignados?).",
          )
        }
        onRestoreGroup={(g) =>
          plantCrud.onRestore(g, "No se pudo reactivar la planta.")
        }
        onEditChild={openEditLoc}
        onSoftDeleteChild={(l) =>
          locCrud.onSoftDelete(l, "No se pudo desactivar la ubicación.")
        }
        onHardDeleteChild={(l) =>
          locCrud.onHardDelete(
            l,
            "No se pudo eliminar la ubicación (¿tiene equipos o celdas asignados?).",
          )
        }
        onRestoreChild={(l) =>
          locCrud.onRestore(l, "No se pudo reactivar la ubicación.")
        }
        onAfterChange={() => router.refresh()}
      />

      <EntityFormDialog
        open={plantCrud.modalState.open}
        onOpenChange={(open) => {
          if (!open) plantCrud.closeModal();
        }}
        title={
          plantCrud.modalState.editId === null ? "Nueva planta" : "Editar planta"
        }
        busy={plantCrud.busy}
        error={plantCrud.error}
        onSubmit={onSubmitPlant}
        onCancel={() => plantCrud.closeModal()}
        submitLabel={
          plantCrud.modalState.editId === null ? "Crear planta" : "Guardar cambios"
        }
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
                disabled={plantCrud.busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plant-name">Nombre *</Label>
              <Input
                id="plant-name"
                value={plantName}
                onChange={(e) => setPlantName(e.target.value)}
                maxLength={160}
                disabled={plantCrud.busy}
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
              disabled={plantCrud.busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plant-postal">Código postal</Label>
            <Input
              id="plant-postal"
              value={plantPostal}
              onChange={(e) => setPlantPostal(e.target.value)}
              maxLength={16}
              disabled={plantCrud.busy}
            />
          </div>
        </div>
      </EntityFormDialog>

      <EntityFormDialog
        open={locCrud.modalState.open}
        onOpenChange={(open) => {
          if (!open) locCrud.closeModal();
        }}
        title={
          locCrud.modalState.editId === null ? "Nueva ubicación" : "Editar ubicación"
        }
        description={
          plantName_ ? `Ubicación dentro de ${plantName_}.` : undefined
        }
        busy={locCrud.busy}
        error={locCrud.error}
        onSubmit={onSubmitLoc}
        onCancel={() => locCrud.closeModal()}
        submitLabel={
          locCrud.modalState.editId === null ? "Crear ubicación" : "Guardar cambios"
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="loc-code">Código *</Label>
            <Input
              id="loc-code"
              value={locCode}
              onChange={(e) => setLocCode(e.target.value)}
              maxLength={32}
              disabled={locCrud.busy}
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
              disabled={locCrud.busy}
              placeholder="p. ej. Nave de producción 1"
            />
          </div>
        </div>
      </EntityFormDialog>
    </>
  );
}
