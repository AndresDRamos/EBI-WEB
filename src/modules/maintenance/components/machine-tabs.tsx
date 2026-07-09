"use client";

import * as React from "react";
import {
  CalendarCheck,
  Download,
  FileText,
  Pencil,
  Plus,
  Trash2,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
import { useCan } from "@/components/providers/permissions-provider";
import {
  DOC_TYPES,
  RESTRICTION_TYPES,
  docTypeLabel,
  restrictionTypeLabel,
} from "@/modules/maintenance/enums";

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
// Mantenimiento — representative entry points for the next module phase
// (plans + work orders exist in the schema since V6 but have no UI yet).
// ---------------------------------------------------------------------------

export function MantenimientoTab() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <button
        type="button"
        disabled
        className="flex flex-col items-start gap-2 rounded-lg border bg-card p-5 text-left transition-colors hover:border-ezi-orange/50 disabled:cursor-default"
        title="Próximamente"
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-ezi-orange">
          <CalendarCheck className="h-5 w-5" />
        </span>
        <span className="font-semibold text-ezi-gray">Mantenimiento preventivo</span>
        <span className="text-xs text-muted-foreground">
          Planes programados, checklists y órdenes de trabajo del equipo.
          Próximamente.
        </span>
      </button>
      <button
        type="button"
        disabled
        className="flex flex-col items-start gap-2 rounded-lg border bg-card p-5 text-left transition-colors hover:border-ezi-orange/50 disabled:cursor-default"
        title="Próximamente"
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-ezi-orange">
          <Wrench className="h-5 w-5" />
        </span>
        <span className="font-semibold text-ezi-gray">Mantenimiento autónomo</span>
        <span className="text-xs text-muted-foreground">
          Rutinas del operador: limpieza, inspección y lubricación de primera
          línea. Próximamente.
        </span>
      </button>
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
