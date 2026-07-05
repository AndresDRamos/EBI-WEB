"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutGrid } from "lucide-react";
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

export interface LineOption {
  line_id: number;
  code: string;
  name: string;
}

export interface CellsTableRow {
  cell_id: number;
  code: string;
  name: string;
  plant_id: number;
  plant_name: string;
  line_id: number | null;
  line_code: string | null;
  line_name: string | null;
  sequence_in_line: number | null;
  current_asset_count: number;
  is_active: boolean;
}

export interface CellsTablePageProps {
  cells: CellsTableRow[];
  plants: PlantOption[];
  lines: LineOption[];
}

/** Celdas catalog — logical production posts. A cell optionally belongs to a
 * line (with an Op sequence). Composition is managed in the cell detail. */
export function CellsTablePage({ cells, plants, lines }: CellsTablePageProps) {
  const can = useCan();
  const router = useRouter();
  const [modal, setModal] = React.useState<{
    open: boolean;
    edit: CellsTableRow | null;
  }>({ open: false, edit: null });

  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [plantId, setPlantId] = React.useState("");
  const [lineId, setLineId] = React.useState("");
  const [sequence, setSequence] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  function openCreate() {
    setCode("");
    setName("");
    setPlantId("");
    setLineId("");
    setSequence("");
    setError(null);
    setModal({ open: true, edit: null });
  }

  function openEdit(row: CellsTableRow) {
    setCode(row.code);
    setName(row.name);
    setPlantId(String(row.plant_id));
    setLineId(row.line_id ? String(row.line_id) : "");
    setSequence(row.sequence_in_line ? String(row.sequence_in_line) : "");
    setError(null);
    setModal({ open: true, edit: row });
  }

  async function onSubmit() {
    setError(null);
    if (!code.trim() || !name.trim() || !plantId) {
      setError("Código, nombre y planta son obligatorios.");
      return;
    }
    if (sequence && !lineId) {
      setError("La secuencia solo aplica cuando la celda pertenece a una línea.");
      return;
    }
    setBusy(true);
    try {
      const edit = modal.edit;
      const url = edit
        ? `/api/production/cells/${edit.cell_id}`
        : "/api/production/cells";
      const res = await fetch(url, {
        method: edit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          plant_id: Number(plantId),
          line_id: lineId ? Number(lineId) : null,
          sequence_in_line: sequence ? Number(sequence) : null,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo guardar la celda.");
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
    row: CellsTableRow,
    isActive: boolean,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/production/cells/${row.cell_id}`, {
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
            ? "No se pudo reactivar la celda."
            : "No se pudo desactivar la celda."),
      };
    }
    router.refresh();
    return { ok: true };
  }

  const plantOptions = [...new Set(cells.map((c) => c.plant_name))].map(
    (name) => ({ value: name, label: name }),
  );
  const lineOptions = [
    ...new Set(cells.map((c) => c.line_code ?? "")),
  ]
    .filter((v) => v !== "")
    .map((v) => ({ value: v, label: v }));

  const columns: ColumnDef<CellsTableRow>[] = React.useMemo(
    () => [
      {
        key: "code",
        header: "Código",
        accessor: (r) => r.code,
        filter: { kind: "text" },
        render: (r) => (
          <Link
            href={`/production/cells/${r.cell_id}`}
            className="font-mono font-medium text-ezi-gray underline-offset-2 hover:text-ezi-orange hover:underline"
          >
            {r.code}
          </Link>
        ),
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
        key: "line",
        header: "Línea",
        accessor: (r) => r.line_code ?? "",
        filter: { kind: "catalog", options: lineOptions },
        render: (r) =>
          r.line_code ? (
            <span>
              <span className="font-mono">{r.line_code}</span>
              {r.sequence_in_line != null ? (
                <span className="text-muted-foreground">
                  {" "}
                  · Op {r.sequence_in_line}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        className: "w-40",
      },
      {
        key: "assets",
        header: "Equipos",
        accessor: (r) => r.current_asset_count,
        className: "w-24",
      },
    ],
    [plantOptions, lineOptions],
  );

  return (
    <>
      <DataTable
        icon={LayoutGrid}
        title="Celdas"
        subtitle="Celdas de producción: el puesto lógico donde trabajan los equipos. La composición se administra en el detalle."
        rows={cells}
        getRowId={(r) => r.cell_id}
        columns={columns}
        isActive={(r) => r.is_active}
        onAdd={can("production.cell:create") ? openCreate : undefined}
        onEdit={can("production.cell:update") ? openEdit : undefined}
        onSoftDelete={
          can("production.cell:update") ? (r) => setActive(r, false) : undefined
        }
        onRestore={
          can("production.cell:update") ? (r) => setActive(r, true) : undefined
        }
        addLabel="Nueva celda"
        onAfterChange={() => router.refresh()}
      />
      <EntityFormDialog
        open={modal.open}
        onOpenChange={(open) =>
          setModal((prev) => ({ open, edit: open ? prev.edit : null }))
        }
        title={modal.edit ? "Editar celda" : "Nueva celda"}
        busy={busy}
        error={error}
        onSubmit={onSubmit}
        onCancel={() => setModal({ open: false, edit: null })}
        submitLabel={modal.edit ? "Guardar cambios" : "Crear celda"}
        sizeClassName="sm:max-w-lg"
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cell-code">Código *</Label>
              <Input
                id="cell-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={32}
                disabled={busy}
                placeholder="p. ej. LASER-1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cell-name">Nombre *</Label>
              <Input
                id="cell-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={160}
                disabled={busy}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cell-plant">Planta *</Label>
            <Select
              id="cell-plant"
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cell-line">Línea (opcional)</Label>
              <Select
                id="cell-line"
                value={lineId}
                onChange={(e) => {
                  setLineId(e.target.value);
                  if (!e.target.value) setSequence("");
                }}
                disabled={busy}
              >
                <option value="">Sin línea (celda independiente)</option>
                {lines.map((l) => (
                  <option key={l.line_id} value={l.line_id}>
                    {l.code} — {l.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cell-sequence">Secuencia (Op)</Label>
              <Input
                id="cell-sequence"
                type="number"
                min={1}
                value={sequence}
                onChange={(e) => setSequence(e.target.value)}
                disabled={busy || !lineId}
                placeholder={lineId ? "p. ej. 20" : "Requiere línea"}
              />
            </div>
          </div>
        </div>
      </EntityFormDialog>
    </>
  );
}
