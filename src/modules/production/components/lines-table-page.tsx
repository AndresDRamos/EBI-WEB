"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Layers } from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
import { useCan } from "@/components/providers/permissions-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export interface PlantOption {
  plant_id: number;
  name: string;
}

export interface LinesTableRow {
  line_id: number;
  code: string;
  name: string;
  plant_id: number;
  plant_name: string;
  cell_count: number;
  is_active: boolean;
}

export interface LinesTablePageProps {
  lines: LinesTableRow[];
  plants: PlantOption[];
}

/** Líneas catalog — sequencing containers for production cells. Actions gate
 * per-permission via `useCan`; the API re-checks server-side. */
export function LinesTablePage({ lines, plants }: LinesTablePageProps) {
  const can = useCan();
  const router = useRouter();
  const [modal, setModal] = React.useState<{
    open: boolean;
    edit: LinesTableRow | null;
  }>({ open: false, edit: null });

  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [plantId, setPlantId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  function openCreate() {
    setCode("");
    setName("");
    setPlantId("");
    setError(null);
    setModal({ open: true, edit: null });
  }

  function openEdit(row: LinesTableRow) {
    setCode(row.code);
    setName(row.name);
    setPlantId(String(row.plant_id));
    setError(null);
    setModal({ open: true, edit: row });
  }

  async function onSubmit() {
    setError(null);
    if (!code.trim() || !name.trim() || !plantId) {
      setError("Código, nombre y planta son obligatorios.");
      return;
    }
    setBusy(true);
    try {
      const edit = modal.edit;
      const url = edit
        ? `/api/production/lines/${edit.line_id}`
        : "/api/production/lines";
      const res = await fetch(url, {
        method: edit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          plant_id: Number(plantId),
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo guardar la línea.");
      }
      setModal({ open: false, edit: null });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  async function setActive(
    row: LinesTableRow,
    isActive: boolean,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/production/lines/${row.line_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: isActive }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return {
        ok: false,
        error:
          d.error ??
          (isActive
            ? "No se pudo reactivar la línea."
            : "No se pudo desactivar la línea."),
      };
    }
    router.refresh();
    return { ok: true };
  }

  const plantOptions = [...new Set(lines.map((l) => l.plant_name))].map(
    (name) => ({ value: name, label: name }),
  );

  const columns: ColumnDef<LinesTableRow>[] = React.useMemo(
    () => [
      {
        key: "code",
        header: "Código",
        accessor: (r) => r.code,
        filter: { kind: "text" },
        render: (r) => <span className="font-mono">{r.code}</span>,
        className: "w-32",
      },
      {
        key: "name",
        header: "Nombre",
        accessor: (r) => r.name,
        filter: { kind: "text" },
        render: (r) => <span className="font-medium">{r.name}</span>,
      },
      {
        key: "plant",
        header: "Planta",
        accessor: (r) => r.plant_name,
        filter: { kind: "catalog", options: plantOptions },
        className: "w-40",
      },
      {
        key: "cells",
        header: "Celdas",
        accessor: (r) => r.cell_count,
        className: "w-24",
      },
    ],
    [plantOptions],
  );

  return (
    <>
      <DataTable
        icon={Layers}
        title="Líneas"
        subtitle="Líneas de producción: contenedores de secuencia (Op 10 → Op 20 → …) para las celdas que pertenecen a una."
        rows={lines}
        getRowId={(r) => r.line_id}
        columns={columns}
        isActive={(r) => r.is_active}
        onAdd={can("production.line:create") ? openCreate : undefined}
        onEdit={can("production.line:update") ? openEdit : undefined}
        onSoftDelete={
          can("production.line:update") ? (r) => setActive(r, false) : undefined
        }
        onRestore={
          can("production.line:update") ? (r) => setActive(r, true) : undefined
        }
        addLabel="Nueva línea"
        onAfterChange={() => router.refresh()}
      />
      <EntityFormDialog
        open={modal.open}
        onOpenChange={(open) =>
          setModal((prev) => ({ open, edit: open ? prev.edit : null }))
        }
        title={modal.edit ? "Editar línea" : "Nueva línea"}
        busy={busy}
        error={error}
        onSubmit={onSubmit}
        onCancel={() => setModal({ open: false, edit: null })}
        submitLabel={modal.edit ? "Guardar cambios" : "Crear línea"}
        sizeClassName="sm:max-w-lg"
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="line-code">Código *</Label>
              <Input
                id="line-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={32}
                disabled={busy}
                placeholder="p. ej. TF"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="line-name">Nombre *</Label>
              <Input
                id="line-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={160}
                disabled={busy}
                placeholder="p. ej. Línea Track Frame"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="line-plant">Planta *</Label>
            <Select
              id="line-plant"
              value={plantId}
              onChange={(e) => setPlantId(e.target.value)}
              disabled={busy}
            >
              <option value="">Selecciona…</option>
              {plants.map((p) => (
                <option key={p.plant_id} value={p.plant_id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </EntityFormDialog>
    </>
  );
}
