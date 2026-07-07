"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileUp, Map, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/components/providers/permissions-provider";
import { LayoutCanvas } from "./layout-canvas";
import { ValidationReportView } from "./validation-report-view";
import type {
  LayoutGeometry,
  ValidationReport,
} from "@/modules/production/dxf/geometry";

export interface PlantOption {
  plant_id: number;
  name: string;
}

interface DraftState {
  layout_id: number;
  name: string;
  version: number;
  geometry: LayoutGeometry;
  report: ValidationReport;
}

/**
 * DXF import wizard: upload → validation report (+ rendered preview when the
 * contract passes) → confirm (activates the draft, archives the previous
 * version, carries placements forward) or discard. A failing file shows the
 * report and persists nothing.
 */
export function LayoutImportWizard({ plants }: { plants: PlantOption[] }) {
  const can = useCan();
  const router = useRouter();
  const [plantId, setPlantId] = React.useState(
    plants.length === 1 ? String(plants[0].plant_id) : "",
  );
  const [name, setName] = React.useState("");
  const [note, setNote] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [failedReport, setFailedReport] = React.useState<ValidationReport | null>(
    null,
  );
  const [draft, setDraft] = React.useState<DraftState | null>(null);

  const canCreate = can("production.layout:create");
  const canActivate = can("production.layout:activate");

  async function onImport() {
    setError(null);
    setFailedReport(null);
    if (!file || !plantId) {
      setError("Selecciona planta y archivo DXF.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("plant_id", plantId);
      if (name.trim()) form.set("name", name.trim());
      if (note.trim()) form.set("note", note.trim());
      const res = await fetch("/api/production/layouts/import", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        report?: ValidationReport;
        layout?: DraftState & { geometry: LayoutGeometry };
      };
      if (!res.ok) {
        if (data.report) setFailedReport(data.report);
        throw new Error(data.error ?? "No se pudo importar el archivo.");
      }
      if (data.layout && data.report) {
        setDraft({
          layout_id: data.layout.layout_id,
          name: data.layout.name,
          version: data.layout.version,
          geometry: data.layout.geometry,
          report: data.report,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/production/layouts/${draft.layout_id}/confirm`,
        { method: "POST" },
      );
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo activar el layout.");
      }
      router.push("/test/layout");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
      setBusy(false);
    }
  }

  async function onDiscard() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/production/layouts/${draft.layout_id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo descartar el borrador.");
      }
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  if (!canCreate) {
    return (
      <p className="text-sm text-muted-foreground">
        No tienes permiso para importar layouts.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {!draft ? (
        <div className="max-w-xl space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wizard-plant">Planta *</Label>
            <Select
              id="wizard-plant"
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
          <div className="space-y-2">
            <Label htmlFor="wizard-file">Archivo DXF *</Label>
            <Input
              id="wizard-file"
              type="file"
              accept=".dxf"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              AutoCAD 2018 DXF (ASCII) con las capas EBI-* del contrato CAD.
              Máximo 50 MB.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wizard-name">Nombre</Label>
              <Input
                id="wizard-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={160}
                disabled={busy}
                placeholder="p. ej. Planta 7 — piso"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wizard-note">Nota</Label>
              <Textarea
                id="wizard-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                rows={2}
                disabled={busy}
              />
            </div>
          </div>
          {failedReport ? <ValidationReportView report={failedReport} /> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button onClick={onImport} disabled={busy || !file || !plantId}>
            <FileUp className="mr-2 h-4 w-4" />
            {busy ? "Procesando…" : "Importar y validar"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Map className="h-5 w-5 text-[#ff5c35]" />
                {draft.name} · v{draft.version} (borrador)
              </h2>
              <p className="text-sm text-muted-foreground">
                {draft.geometry.width_m} × {draft.geometry.height_m} m ·{" "}
                {draft.geometry.ports.length} puertos ·{" "}
                {draft.geometry.zones.length} zonas
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={onDiscard}
                disabled={busy}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Descartar borrador
              </Button>
              {canActivate ? (
                <Button onClick={onConfirm} disabled={busy}>
                  {busy ? "Activando…" : "Confirmar y activar"}
                </Button>
              ) : null}
            </div>
          </div>
          {!canActivate ? (
            <p className="text-sm text-muted-foreground">
              El borrador quedó guardado; otra persona con permiso de
              activación deberá confirmarlo.
            </p>
          ) : null}
          <ValidationReportView report={draft.report} />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="h-[60vh] rounded-lg border border-border bg-white">
            <LayoutCanvas geometry={draft.geometry} />
          </div>
        </div>
      )}
    </div>
  );
}
