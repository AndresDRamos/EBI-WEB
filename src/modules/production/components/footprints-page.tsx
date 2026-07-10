"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Boxes } from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
import { apiMutate } from "@/lib/api-client";
import { useCan } from "@/components/providers/permissions-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ValidationReportView } from "./validation-report-view";
import type { ValidationReport } from "@/modules/production/dxf/geometry";

export interface FootprintTableRow {
  asset_id: number;
  code: string;
  name: string;
  plant_name: string;
  width_m: number | null;
  depth_m: number | null;
  source_kind: string | null;
  updated_at: string | null;
}

export interface FootprintsPageProps {
  rows: FootprintTableRow[];
}

/**
 * Asset footprint management: every asset needs a top view (small DXF per the
 * CAD contract, or a W×D rectangle quick-create) before it can be placed on a
 * layout. One footprint per asset, edit-in-place.
 */
export function FootprintsPage({ rows }: FootprintsPageProps) {
  const can = useCan();
  const router = useRouter();
  const canManage = can("production.footprint:manage");

  const [modal, setModal] = React.useState<{
    open: boolean;
    row: FootprintTableRow | null;
  }>({ open: false, row: null });
  const [mode, setMode] = React.useState<"rectangle" | "dxf">("rectangle");
  const [width, setWidth] = React.useState("");
  const [depth, setDepth] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<ValidationReport | null>(null);

  function openEdit(row: FootprintTableRow) {
    setMode(row.source_kind === "dxf" ? "dxf" : "rectangle");
    setWidth(row.width_m != null ? String(row.width_m) : "");
    setDepth(row.depth_m != null ? String(row.depth_m) : "");
    setFile(null);
    setError(null);
    setReport(null);
    setModal({ open: true, row });
  }

  async function onSubmit() {
    const row = modal.row;
    if (!row) return;
    setError(null);
    setReport(null);
    setBusy(true);
    try {
      if (mode === "dxf") {
        if (!file) throw new Error("Selecciona el archivo DXF de la huella.");
        const form = new FormData();
        form.set("file", file);
        // FormData upload: apiMutate always serializes `body` as JSON, so this
        // call keeps its raw fetch + manual error parsing.
        const res = await fetch(`/api/production/footprints/${row.asset_id}`, {
          method: "PUT",
          body: form,
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          report?: ValidationReport;
        };
        if (!res.ok) {
          if (data.report) setReport(data.report);
          throw new Error(data.error ?? "No se pudo guardar la huella.");
        }
      } else {
        await apiMutate(`/api/production/footprints/${row.asset_id}`, {
          method: "PUT",
          body: {
            source_kind: "rectangle",
            width_m: Number(width),
            depth_m: Number(depth),
          },
          fallback: "No se pudo guardar la huella.",
        });
      }
      setModal({ open: false, row: null });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  const plantOptions = [...new Set(rows.map((r) => r.plant_name))].map(
    (name) => ({ value: name, label: name }),
  );

  const columns: ColumnDef<FootprintTableRow>[] = React.useMemo(
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
        header: "Equipo",
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
        key: "footprint",
        header: "Huella",
        accessor: (r) =>
          r.width_m != null ? `${r.width_m} × ${r.depth_m} m` : "",
        render: (r) =>
          r.width_m != null ? (
            <span>
              {r.width_m} × {r.depth_m} m{" "}
              <span className="text-xs text-muted-foreground">
                ({r.source_kind === "dxf" ? "DXF" : "rectángulo"})
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Sin huella</span>
          ),
        className: "w-48",
      },
    ],
    [plantOptions],
  );

  return (
    <>
      <DataTable
        icon={Boxes}
        title="Huellas de equipo"
        subtitle="Vista superior a escala real de cada equipo (DXF del contrato CAD o rectángulo ancho × fondo). Requisito para colocarlo en el layout."
        rows={rows}
        getRowId={(r) => r.asset_id}
        columns={columns}
        isActive={() => true}
        onEdit={canManage ? openEdit : undefined}
      />
      <EntityFormDialog
        open={modal.open}
        onOpenChange={(open) =>
          setModal((prev) => ({ open, row: open ? prev.row : null }))
        }
        title={
          modal.row
            ? `Huella de ${modal.row.code} — ${modal.row.name}`
            : "Huella"
        }
        busy={busy}
        error={error}
        onSubmit={onSubmit}
        onCancel={() => setModal({ open: false, row: null })}
        submitLabel="Guardar huella"
        sizeClassName="sm:max-w-lg"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fp-mode">Origen</Label>
            <Select
              id="fp-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as "rectangle" | "dxf")}
              disabled={busy}
            >
              <option value="rectangle">Rectángulo (ancho × fondo)</option>
              <option value="dxf">DXF (contrato CAD)</option>
            </Select>
          </div>
          {mode === "rectangle" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fp-width">Ancho (m) *</Label>
                <Input
                  id="fp-width"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="100"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fp-depth">Fondo (m) *</Label>
                <Input
                  id="fp-depth"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="100"
                  value={depth}
                  onChange={(e) => setDepth(e.target.value)}
                  disabled={busy}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="fp-file">Archivo DXF *</Label>
              <Input
                id="fp-file"
                type="file"
                accept=".dxf"
                disabled={busy}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                Una polilínea cerrada en EBI-OUTLINE con la vista superior del
                equipo, en metros; puertos EBI_PORT_* opcionales.
              </p>
            </div>
          )}
          {report ? <ValidationReportView report={report} /> : null}
        </div>
      </EntityFormDialog>
    </>
  );
}
