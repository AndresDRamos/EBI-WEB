"use client";

import * as React from "react";
import { Factory } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
import { apiMutate } from "@/lib/api-client";
import type { LocationCardOption } from "@/modules/production/components/operative-cells-page";
import type {
  FormTarget,
  ProcessOption,
} from "@/modules/production/components/location-cells-modal";

// ---------------------------------------------------------------------------
// Create / edit form — location implicit, code auto-generated server-side
// ---------------------------------------------------------------------------

/** Remounted via `key` per target, so `useState` initializers re-seed without
 * effects (house pattern — see MachineFormDialog / AssignDialog). */
export function CellFormDialog(props: {
  target: FormTarget | null;
  location: LocationCardOption;
  plantName: string;
  processes: ProcessOption[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const key =
    props.target === null
      ? "closed"
      : props.target.mode === "edit"
        ? `edit-${props.target.cell.cell_id}`
        : `create-${props.target.parent?.cell_id ?? "root"}`;
  return <CellFormDialogInner key={key} {...props} />;
}

function CellFormDialogInner({
  target,
  location,
  processes,
  onOpenChange,
  onSaved,
}: {
  target: FormTarget | null;
  location: LocationCardOption;
  plantName: string;
  processes: ProcessOption[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const editing = target?.mode === "edit" ? target.cell : null;
  const parent = target?.mode === "create" ? target.parent : null;
  const [name, setName] = React.useState(editing?.name ?? "");
  const [sizeX, setSizeX] = React.useState(
    editing?.size_x_m != null ? String(Number(editing.size_x_m)) : "",
  );
  const [sizeY, setSizeY] = React.useState(
    editing?.size_y_m != null ? String(Number(editing.size_y_m)) : "",
  );
  const [processId, setProcessId] = React.useState(
    editing?.process_id != null ? String(editing.process_id) : "",
  );
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const title = editing
    ? `Editar ${editing.code}`
    : parent
      ? `Nueva operación en ${parent.name}`
      : "Nueva celda operativa";

  async function onSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    const x = Number(sizeX);
    const y = Number(sizeY);
    if (!editing && (!sizeX || !sizeY || !(x > 0) || !(y > 0))) {
      setError("El tamaño X y Y (en metros) es obligatorio y mayor a cero.");
      return;
    }
    if ((sizeX && !(x > 0)) || (sizeY && !(y > 0))) {
      setError("El tamaño debe ser mayor a cero.");
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await apiMutate(`/api/production/cells/${editing.cell_id}`, {
          method: "PATCH",
          body: {
            name: name.trim(),
            size_x_m: sizeX ? x : null,
            size_y_m: sizeY ? y : null,
            process_id: processId ? Number(processId) : null,
          },
          fallback: "No se pudo guardar la celda.",
        });
      } else {
        await apiMutate(`/api/production/cells`, {
          method: "POST",
          body: {
            name: name.trim(),
            location_id: location.location_id,
            parent_cell_id: parent?.cell_id ?? null,
            size_x_m: x,
            size_y_m: y,
            process_id: processId ? Number(processId) : null,
          },
          fallback: "No se pudo guardar la celda.",
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <EntityFormDialog
      open={target !== null}
      onOpenChange={onOpenChange}
      title={title}
      busy={busy}
      error={error}
      onSubmit={onSubmit}
      onCancel={() => onOpenChange(false)}
      submitLabel={editing ? "Guardar" : "Crear"}
      sizeClassName="sm:max-w-lg"
    >
      <div className="space-y-4">
        {!editing ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed bg-gray-50 px-3 py-2 text-xs text-muted-foreground">
            <Factory className="h-3.5 w-3.5 shrink-0" />
            <span>
              Ubicación <strong>{location.name}</strong>
              {parent ? (
                <>
                  {" "}
                  · operación de <strong>{parent.name}</strong>
                </>
              ) : null}
              . El código se genera automáticamente.
            </span>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="cell-name">Nombre *</Label>
          <Input
            id="cell-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={160}
            disabled={busy}
            placeholder="p. ej. Celda de corte láser"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cell-size-x">Tamaño X (m) {editing ? "" : "*"}</Label>
            <Input
              id="cell-size-x"
              type="number"
              min={0}
              step="0.1"
              value={sizeX}
              onChange={(e) => setSizeX(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cell-size-y">Tamaño Y (m) {editing ? "" : "*"}</Label>
            <Input
              id="cell-size-y"
              type="number"
              min={0}
              step="0.1"
              value={sizeY}
              onChange={(e) => setSizeY(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cell-process">Proceso</Label>
          <Select
            id="cell-process"
            value={processId}
            onChange={(e) => setProcessId(e.target.value)}
            disabled={busy}
          >
            <option value="">Sin proceso</option>
            {processes.map((p) => (
              <option key={p.process_id} value={p.process_id}>
                {p.name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Con proceso, solo se podrán asignar equipos cuyo tipo lo soporte.
          </p>
        </div>
      </div>
    </EntityFormDialog>
  );
}
