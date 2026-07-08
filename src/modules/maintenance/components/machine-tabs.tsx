"use client";

import * as React from "react";
import Link from "next/link";
import { Download, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
import { useCan } from "@/components/providers/permissions-provider";
import type { ProcessOption } from "@/modules/maintenance/components/machine-form-dialog";
import {
  DOC_TYPES,
  RESTRICTION_TYPES,
  docTypeLabel,
  restrictionTypeLabel,
} from "@/modules/maintenance/enums";

export type { ProcessOption };

export interface RestrictionItem {
  restriction_id: number;
  restriction_type: string;
  description: string;
  is_active: boolean;
}

export interface DocumentItem {
  document_id: number;
  doc_type: string;
  title: string;
  content_type: string | null;
  file_size_bytes: number | null;
  version: number;
  is_active: boolean;
  uploaded_at: string;
}

/** Asset ↔ cell assignment row (module production, read-only here — the
 * assign/close/reassign actions live on the cell detail page). */
export interface AssignmentItem {
  assignment_id: number;
  cell_id: number;
  cell_code: string;
  cell_name: string;
  role_label: string | null;
  valid_from: string;
  valid_to: string | null;
}

// ---------------------------------------------------------------------------
// Procesos
// ---------------------------------------------------------------------------

export function ProcesosTab({
  assetId,
  assetProcessIds,
  allProcesses,
  onChanged,
}: {
  assetId: number;
  assetProcessIds: number[];
  allProcesses: ProcessOption[];
  onChanged: (processIds: number[]) => void;
}) {
  const can = useCan();
  const [selected, setSelected] = React.useState<number[]>(assetProcessIds);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const dirty =
    selected.length !== assetProcessIds.length ||
    selected.some((id) => !assetProcessIds.includes(id));

  async function onSave() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/maintenance/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ process_ids: selected }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudieron guardar los procesos.");
      }
      onChanged(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  // Saving the process set PATCHes the asset — same permission as editing it.
  if (!can("maintenance.asset:update")) {
    const names = allProcesses
      .filter((p) => assetProcessIds.includes(p.process_id))
      .map((p) => p.name);
    return (
      <div className="rounded-lg border bg-card p-4">
        {names.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este equipo no tiene procesos asignados.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {names.map((n) => (
              <Badge key={n} variant="outline">
                {n}
              </Badge>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">
        Procesos que ejecuta este equipo (multi-proceso permitido).
      </p>
      {allProcesses.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay procesos en el catálogo. Un administrador los crea en{" "}
          <Link href="/admin/organization/processes" className="underline">
            Organización → Procesos
          </Link>
          .
        </p>
      ) : (
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {allProcesses.map((p) => (
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
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button onClick={onSave} disabled={busy || !dirty}>
          {busy ? "Guardando…" : "Guardar procesos"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ubicación (asignación a celdas de producción — módulo production)
// ---------------------------------------------------------------------------

export function UbicacionTab({ assignments }: { assignments: AssignmentItem[] }) {
  const current = assignments.filter((a) => a.valid_to === null);
  const history = assignments.filter((a) => a.valid_to !== null);

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Celdas de producción donde trabaja este equipo hoy. La asignación se
          administra desde el detalle de cada celda en{" "}
          <Link href="/production/cells" className="underline">
            Producción → Celdas
          </Link>
          .
        </p>
        {current.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin celda asignada (equipo de pool o pendiente de asignar).
          </p>
        ) : (
          <ul className="divide-y">
            {current.map((a) => (
              <li key={a.assignment_id} className="flex items-center gap-3 py-2.5">
                <Link
                  href={`/production/cells/${a.cell_id}`}
                  className="font-mono text-sm font-medium text-ezi-gray underline-offset-2 hover:text-ezi-orange hover:underline"
                >
                  {a.cell_code}
                </Link>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {a.cell_name}
                  {a.role_label ? (
                    <span className="text-muted-foreground"> · {a.role_label}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  desde {a.valid_from.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {history.length > 0 ? (
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Historial de asignaciones
          </p>
          <ul className="divide-y">
            {history.map((a) => (
              <li
                key={a.assignment_id}
                className="flex items-center gap-3 py-2 text-muted-foreground"
              >
                <span className="font-mono text-sm">{a.cell_code}</span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {a.cell_name}
                  {a.role_label ? <span> · {a.role_label}</span> : null}
                </span>
                <span className="shrink-0 text-xs">
                  {a.valid_from.slice(0, 10)} → {a.valid_to?.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Restricciones
// ---------------------------------------------------------------------------

export function RestriccionesTab({
  assetId,
  restrictions,
  onChanged,
}: {
  assetId: number;
  restrictions: RestrictionItem[];
  onChanged: () => void;
}) {
  const can = useCan();
  const [modal, setModal] = React.useState<{
    open: boolean;
    edit: RestrictionItem | null;
  }>({ open: false, edit: null });
  const [type, setType] = React.useState<string>("limitation");
  const [description, setDescription] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function openCreate() {
    setType("limitation");
    setDescription("");
    setError(null);
    setModal({ open: true, edit: null });
  }

  function openEdit(r: RestrictionItem) {
    setType(r.restriction_type);
    setDescription(r.description);
    setError(null);
    setModal({ open: true, edit: r });
  }

  async function onSubmit() {
    setError(null);
    if (!description.trim()) {
      setError("La descripción es obligatoria.");
      return;
    }
    setBusy(true);
    try {
      const edit = modal.edit;
      const url = edit
        ? `/api/maintenance/assets/${assetId}/restrictions/${edit.restriction_id}`
        : `/api/maintenance/assets/${assetId}/restrictions`;
      const res = await fetch(url, {
        method: edit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restriction_type: type,
          description: description.trim(),
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo guardar la restricción.");
      }
      setModal({ open: false, edit: null });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  async function onDeactivate(r: RestrictionItem) {
    const res = await fetch(
      `/api/maintenance/assets/${assetId}/restrictions/${r.restriction_id}`,
      { method: "DELETE" },
    );
    if (res.ok) onChanged();
  }

  const active = restrictions.filter((r) => r.is_active);

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Restricciones y limitaciones operativas o de seguridad del equipo.
        </p>
        {can("maintenance.restriction:create") ? (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nueva restricción
          </Button>
        ) : null}
      </div>
      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin restricciones registradas.</p>
      ) : (
        <ul className="divide-y">
          {active.map((r) => (
            <li key={r.restriction_id} className="flex items-start gap-3 py-2.5">
              <Badge variant="outline" className="mt-0.5 shrink-0">
                {restrictionTypeLabel(r.restriction_type)}
              </Badge>
              <p className="flex-1 whitespace-pre-wrap text-sm">{r.description}</p>
              {can("maintenance.restriction:update") ||
              can("maintenance.restriction:delete") ? (
                <span className="flex shrink-0 items-center gap-1">
                  {can("maintenance.restriction:update") ? (
                    <button
                      type="button"
                      onClick={() => openEdit(r)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-gray-100"
                      aria-label="Editar restricción"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  {can("maintenance.restriction:delete") ? (
                    <button
                      type="button"
                      onClick={() => void onDeactivate(r)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-orange-50 hover:text-ezi-orange"
                      aria-label="Desactivar restricción"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <EntityFormDialog
        open={modal.open}
        onOpenChange={(open) =>
          setModal((prev) => ({ open, edit: open ? prev.edit : null }))
        }
        title={modal.edit ? "Editar restricción" : "Nueva restricción"}
        busy={busy}
        error={error}
        onSubmit={onSubmit}
        onCancel={() => setModal({ open: false, edit: null })}
        submitLabel={modal.edit ? "Guardar cambios" : "Crear restricción"}
        sizeClassName="sm:max-w-lg"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="restriction-type">Tipo</Label>
            <Select
              id="restriction-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              disabled={busy}
            >
              {RESTRICTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {restrictionTypeLabel(t)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="restriction-description">Descripción *</Label>
            <Textarea
              id="restriction-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              disabled={busy}
            />
          </div>
        </div>
      </EntityFormDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------

export function DocumentosTab({
  assetId,
  documents,
  onChanged,
}: {
  assetId: number;
  documents: DocumentItem[];
  onChanged: () => void;
}) {
  const can = useCan();
  const [modalOpen, setModalOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [docType, setDocType] = React.useState<string>("manual");
  const [title, setTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  function openUpload() {
    setFile(null);
    setDocType("manual");
    setTitle("");
    setError(null);
    setModalOpen(true);
  }

  async function onSubmit() {
    setError(null);
    if (!file) {
      setError("Selecciona un archivo.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("doc_type", docType);
      if (title.trim()) form.set("title", title.trim());
      const res = await fetch(`/api/maintenance/assets/${assetId}/documents`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo subir el documento.");
      }
      setModalOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(d: DocumentItem) {
    const res = await fetch(
      `/api/maintenance/assets/${assetId}/documents/${d.document_id}`,
      { method: "DELETE" },
    );
    if (res.ok) onChanged();
  }

  const active = documents.filter((d) => d.is_active);

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Manuales, diagramas, DXF y fotografías del equipo. Los archivos viven
          en Azure Blob Storage.
        </p>
        {can("maintenance.document:create") ? (
          <Button size="sm" onClick={openUpload}>
            <Plus className="h-4 w-4" />
            Subir documento
          </Button>
        ) : null}
      </div>
      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin documentos.</p>
      ) : (
        <ul className="divide-y">
          {active.map((d) => (
            <li key={d.document_id} className="flex items-center gap-3 py-2.5">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.title}</p>
                <p className="text-xs text-muted-foreground">
                  {docTypeLabel(d.doc_type)}
                  {d.file_size_bytes != null
                    ? ` · ${formatBytes(d.file_size_bytes)}`
                    : ""}
                  {" · "}
                  {d.uploaded_at.slice(0, 10)}
                </p>
              </div>
              <a
                href={`/api/maintenance/assets/${assetId}/documents/${d.document_id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-gray-100 hover:text-ezi-gray"
                aria-label={`Descargar ${d.title}`}
              >
                <Download className="h-3.5 w-3.5" />
              </a>
              {can("maintenance.document:delete") ? (
                <button
                  type="button"
                  onClick={() => void onDelete(d)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-orange-50 hover:text-ezi-orange"
                  aria-label={`Eliminar ${d.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <EntityFormDialog
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="Subir documento"
        busy={busy}
        error={error}
        onSubmit={onSubmit}
        onCancel={() => setModalOpen(false)}
        submitLabel="Subir"
        submittingLabel="Subiendo…"
        sizeClassName="sm:max-w-lg"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="doc-file">Archivo * (máx. 50 MB)</Label>
            <Input
              id="doc-file"
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title.trim()) setTitle(f.name);
              }}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-type">Tipo</Label>
            <Select
              id="doc-type"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              disabled={busy}
            >
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {docTypeLabel(t)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-title">Título</Label>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              disabled={busy}
              placeholder="Se usa el nombre del archivo si se deja vacío"
            />
          </div>
        </div>
      </EntityFormDialog>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
