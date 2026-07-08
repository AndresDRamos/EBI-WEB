"use client";

import * as React from "react";
import { ImagePlus, Search, X } from "lucide-react";
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { normalizeForMatch } from "@/components/kit/table-utils";
import { ASSET_STATUSES, statusLabel } from "@/modules/maintenance/enums";
import { cn } from "@/lib/utils";

export interface PlantOption {
  plant_id: number;
  name: string;
}

/** Asset type option with its parent category (for the grouped select). */
export interface TypeOption {
  asset_type_id: number;
  name: string;
  asset_category_id: number;
  category_name: string;
}

export interface ProcessOption {
  process_id: number;
  code: string;
  name: string;
}

/** Candidate parent assets, with enough data to render the read-only preview. */
export interface ParentOption {
  asset_id: number;
  code: string;
  name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  plant_name: string;
  type_name: string;
  has_image: boolean;
}

/** Subset of asset fields the form edits (create + edit share the dialog). */
export interface MachineFormAsset {
  asset_id: number;
  /** Auto-generated matrícula — display-only in the edit dialog. */
  code: string;
  name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  plant_id: number;
  status: string;
  asset_type_id: number;
  parent_asset_id: number | null;
  installation_date: string | null;
  image_blob_path: string | null;
  notes: string | null;
  /** Current process links (the form edits a single-select over them). */
  process_ids: number[];
}

export interface MachineFormDialogProps {
  open: boolean;
  /** null = create; otherwise edit. */
  asset: MachineFormAsset | null;
  plants: PlantOption[];
  types: TypeOption[];
  processes: ProcessOption[];
  parents: ParentOption[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const MONTHS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/**
 * Create/edit modal for a maintenance asset (plan
 * equipment-maintenance-attributes). The matrícula is generated server-side;
 * the form captures photo, primary data, a type (category derived), a single
 * process, an approximate month/year installation date, and optionally a
 * parent asset picked from a search panel that expands the modal to the right
 * and previews the parent read-only.
 */
export function MachineFormDialog(props: MachineFormDialogProps) {
  const key = props.open
    ? `open-${props.asset?.asset_id ?? "new"}`
    : "closed";
  return <MachineFormDialogInner key={key} {...props} />;
}

function MachineFormDialogInner({
  open,
  asset,
  plants,
  types,
  processes,
  parents,
  onOpenChange,
  onSaved,
}: MachineFormDialogProps) {
  const [name, setName] = React.useState(asset?.name ?? "");
  const [brand, setBrand] = React.useState(asset?.brand ?? "");
  const [model, setModel] = React.useState(asset?.model ?? "");
  const [serial, setSerial] = React.useState(asset?.serial_number ?? "");
  const [plantId, setPlantId] = React.useState<string>(
    asset ? String(asset.plant_id) : "",
  );
  const [status, setStatus] = React.useState(asset?.status ?? "active");
  const [typeId, setTypeId] = React.useState<string>(
    asset?.asset_type_id ? String(asset.asset_type_id) : "",
  );
  const [processId, setProcessId] = React.useState<string>(
    asset?.process_ids?.[0] ? String(asset.process_ids[0]) : "",
  );
  const [installMonth, setInstallMonth] = React.useState<string>(
    asset?.installation_date ? asset.installation_date.slice(5, 7) : "",
  );
  const [installYear, setInstallYear] = React.useState<string>(
    asset?.installation_date ? asset.installation_date.slice(0, 4) : "",
  );
  const [parentId, setParentId] = React.useState<number | null>(
    asset?.parent_asset_id ?? null,
  );
  const [notes, setNotes] = React.useState(asset?.notes ?? "");
  // Photo: `imagePath` is the persisted blob path; `imagePreview` an object
  // URL for a freshly uploaded file (existing images preview via the API).
  const [imagePath, setImagePath] = React.useState<string | null>(
    asset?.image_blob_path ?? null,
  );
  const [imagePreview, setImagePreview] = React.useState<string | null>(null);
  const [imageBusy, setImageBusy] = React.useState(false);
  const [parentPanelOpen, setParentPanelOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const selectedType = types.find((t) => String(t.asset_type_id) === typeId);
  const noTypes = types.length === 0;

  // Group active types under their category for the optgroup select.
  const typeGroups = React.useMemo(() => {
    const byCat = new Map<number, { category: string; items: TypeOption[] }>();
    for (const t of types) {
      const g = byCat.get(t.asset_category_id) ?? {
        category: t.category_name,
        items: [],
      };
      g.items.push(t);
      byCat.set(t.asset_category_id, g);
    }
    return [...byCat.values()].sort((a, b) =>
      a.category.localeCompare(b.category, "es"),
    );
  }, [types]);

  const yearNow = new Date().getFullYear();
  const years = React.useMemo(() => {
    const list: number[] = [];
    for (let y = yearNow; y >= yearNow - 60; y--) list.push(y);
    // An edited asset may carry a year outside the window — keep it selectable.
    const current = installYear ? Number(installYear) : null;
    if (current && !list.includes(current)) list.push(current);
    return list;
  }, [yearNow, installYear]);

  async function onPickImage(file: File) {
    setError(null);
    setImageBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/maintenance/assets/image", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo subir la imagen.");
      }
      const d = (await res.json()) as { blob_path: string };
      setImagePath(d.blob_path);
      setImagePreview(URL.createObjectURL(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setImageBusy(false);
    }
  }

  async function onSubmit() {
    setError(null);
    if (!name.trim() || !plantId) {
      setError("Nombre y planta son obligatorios.");
      return;
    }
    if (!typeId) {
      setError("Selecciona el tipo de equipo.");
      return;
    }
    if ((installMonth && !installYear) || (!installMonth && installYear)) {
      setError("La fecha de instalación necesita mes y año.");
      return;
    }
    setBusy(true);
    try {
      const installationDate =
        installMonth && installYear ? `${installYear}-${installMonth}-01` : null;
      const payload = {
        name: name.trim(),
        plant_id: Number(plantId),
        asset_type_id: Number(typeId),
        brand: brand.trim() || null,
        model: model.trim() || null,
        serial_number: serial.trim() || null,
        status,
        parent_asset_id: parentId,
        installation_date: installationDate,
        image_blob_path: imagePath,
        notes: notes.trim() || null,
      };
      let assetId = asset?.asset_id ?? null;
      if (asset) {
        const res = await fetch(`/api/maintenance/assets/${asset.asset_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            process_ids: processId ? [Number(processId)] : [],
          }),
        });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(d.error ?? "No se pudo guardar el equipo.");
        }
      } else {
        const res = await fetch("/api/maintenance/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(d.error ?? "No se pudo crear el equipo.");
        }
        const d = (await res.json()) as { asset?: { asset_id: number } };
        assetId = d.asset?.asset_id ?? null;
        // The process link rides on a follow-up PATCH (the POST only creates
        // the asset row); a failure here is surfaced, not silent.
        if (assetId && processId) {
          const pres = await fetch(`/api/maintenance/assets/${assetId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ process_ids: [Number(processId)] }),
          });
          if (!pres.ok) {
            throw new Error(
              "El equipo se creó pero no se pudo asignar el proceso; edítalo para reintentar.",
            );
          }
        }
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  const parentChoices = React.useMemo(
    () =>
      asset ? parents.filter((p) => p.asset_id !== asset.asset_id) : parents,
    [parents, asset],
  );
  const selectedParent =
    parentId !== null
      ? parentChoices.find((p) => p.asset_id === parentId) ?? null
      : null;

  const imageSrc =
    imagePreview ??
    (asset?.image_blob_path && imagePath === asset.image_blob_path
      ? `/api/maintenance/assets/${asset.asset_id}/image`
      : null);

  return (
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={asset ? "Editar equipo" : "Nuevo equipo"}
      busy={busy}
      error={error}
      onSubmit={onSubmit}
      onCancel={() => onOpenChange(false)}
      submitLabel={asset ? "Guardar cambios" : "Crear equipo"}
      sizeClassName={parentPanelOpen ? "sm:max-w-5xl" : "sm:max-w-2xl"}
    >
      <div className={cn("flex gap-6", parentPanelOpen && "min-h-[24rem]")}>
        {/* ── Left: the form ─────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1 space-y-4">
          {noTypes ? (
            <p className="rounded-md border border-orange-200 bg-orange-50 p-3 text-xs text-ezi-gray">
              No hay tipos de equipo configurados. Créalos primero en la pestaña{" "}
              <span className="font-semibold">Catálogos</span>.
            </p>
          ) : null}

          {/* Photo box (top-left) + identity fields. */}
          <div className="flex gap-4">
            <div className="shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onPickImage(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy || imageBusy}
                className={cn(
                  "relative flex h-32 w-32 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border-2 border-dashed text-muted-foreground transition-colors hover:border-ezi-orange/60 hover:text-ezi-orange",
                  imageSrc && "border-solid",
                )}
                aria-label="Subir imagen del equipo"
              >
                {imageSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element -- blob/object URLs don't go through the Next image optimizer
                  <img
                    src={imageSrc}
                    alt="Imagen del equipo"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <>
                    <ImagePlus className="h-6 w-6" />
                    <span className="px-2 text-center text-[10px] leading-tight">
                      {imageBusy ? "Subiendo…" : "Imagen del equipo"}
                    </span>
                  </>
                )}
              </button>
              {imageSrc ? (
                <button
                  type="button"
                  onClick={() => {
                    setImagePath(null);
                    setImagePreview(null);
                  }}
                  disabled={busy || imageBusy}
                  className="mt-1 w-full text-center text-[10px] text-muted-foreground hover:text-ezi-orange"
                >
                  Quitar imagen
                </button>
              ) : null}
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="machine-name">Nombre *</Label>
                <Input
                  id="machine-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={200}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <Label>Matrícula</Label>
                {asset ? (
                  <p className="font-mono text-sm">{asset.code}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Se generará automáticamente al guardar (según categoría y
                    planta).
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="machine-brand">Marca</Label>
              <Input
                id="machine-brand"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                maxLength={120}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="machine-model">Modelo</Label>
              <Input
                id="machine-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                maxLength={120}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="machine-serial">Número de serie</Label>
              <Input
                id="machine-serial"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                maxLength={120}
                disabled={busy}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="machine-type">Tipo de equipo *</Label>
              <Select
                id="machine-type"
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
                disabled={busy || noTypes}
              >
                <option value="">Selecciona…</option>
                {typeGroups.map((g) => (
                  <optgroup key={g.category} label={g.category}>
                    {g.items.map((t) => (
                      <option key={t.asset_type_id} value={t.asset_type_id}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
              {selectedType ? (
                <p className="text-xs text-muted-foreground">
                  Categoría:{" "}
                  <span className="font-medium text-ezi-gray">
                    {selectedType.category_name}
                  </span>
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="machine-plant">Planta *</Label>
              <Select
                id="machine-plant"
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="machine-process">Proceso</Label>
              <Select
                id="machine-process"
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="machine-status">Estatus</Label>
              <Select
                id="machine-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={busy}
              >
                {ASSET_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Fecha de instalación</Label>
            <div className="grid grid-cols-2 gap-3">
              <Select
                aria-label="Mes de instalación"
                value={installMonth}
                onChange={(e) => setInstallMonth(e.target.value)}
                disabled={busy}
              >
                <option value="">Mes…</option>
                {MONTHS_ES.map((m, i) => (
                  <option key={m} value={String(i + 1).padStart(2, "0")}>
                    {m}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Año de instalación"
                value={installYear}
                onChange={(e) => setInstallYear(e.target.value)}
                disabled={busy}
              >
                <option value="">Año…</option>
                {years.map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Fecha aproximada (mes y año).
            </p>
          </div>

          <div className="space-y-2">
            <Label>Equipo padre (subconjunto de)</Label>
            {selectedParent ? (
              <div className="flex items-center gap-2 rounded-md border bg-gray-50 px-3 py-2">
                <span className="font-mono text-xs font-semibold text-muted-foreground">
                  {selectedParent.code}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {selectedParent.name}
                </span>
                <button
                  type="button"
                  onClick={() => setParentId(null)}
                  disabled={busy}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-orange-50 hover:text-ezi-orange"
                  aria-label="Quitar equipo padre"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setParentPanelOpen((v) => !v)}
            >
              <Search className="h-3.5 w-3.5" />
              {parentPanelOpen
                ? "Cerrar búsqueda"
                : selectedParent
                  ? "Cambiar equipo padre"
                  : "Buscar equipo padre"}
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="machine-notes">Notas</Label>
            <Textarea
              id="machine-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              rows={3}
              disabled={busy}
            />
          </div>
        </div>

        {/* ── Right: parent search + read-only preview ───────────────────── */}
        {parentPanelOpen ? (
          <ParentSearchPanel
            choices={parentChoices}
            selectedId={parentId}
            onSelect={(id) => setParentId(id)}
            disabled={busy}
          />
        ) : null}
      </div>
    </EntityFormDialog>
  );
}

/**
 * Right-hand expansion of the modal: search the catalog and preview the
 * candidate parent as a read-only, filled presentation card before assigning.
 */
function ParentSearchPanel({
  choices,
  selectedId,
  onSelect,
  disabled,
}: {
  choices: ParentOption[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  disabled: boolean;
}) {
  const [search, setSearch] = React.useState("");
  const [previewId, setPreviewId] = React.useState<number | null>(selectedId);

  const q = normalizeForMatch(search);
  const matches = q
    ? choices.filter((p) =>
        [p.code, p.name, p.brand ?? "", p.model ?? ""].some((v) =>
          normalizeForMatch(v).includes(q),
        ),
      )
    : choices;
  const preview =
    previewId !== null
      ? choices.find((p) => p.asset_id === previewId) ?? null
      : null;

  return (
    <div className="flex w-72 shrink-0 flex-col gap-3 border-l pl-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Buscar equipo padre
      </p>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Matrícula, nombre, marca…"
        disabled={disabled}
      />
      <div className="max-h-40 overflow-auto rounded-md border">
        {matches.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            Sin equipos que coincidan.
          </p>
        ) : (
          matches.map((p) => (
            <button
              key={p.asset_id}
              type="button"
              onClick={() => setPreviewId(p.asset_id)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50",
                previewId === p.asset_id && "bg-orange-50",
              )}
            >
              <span className="font-mono text-[11px] font-semibold text-muted-foreground">
                {p.code}
              </span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
            </button>
          ))
        )}
      </div>

      {preview ? (
        <div className="flex flex-col gap-2 rounded-lg border bg-gray-50/60 p-3">
          {preview.has_image ? (
            // eslint-disable-next-line @next/next/no-img-element -- SAS-redirect URL, not optimizable
            <img
              src={`/api/maintenance/assets/${preview.asset_id}/image`}
              alt={`Imagen de ${preview.name}`}
              className="h-28 w-full rounded-md border object-cover"
            />
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <span className="rounded border bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
              {preview.code}
            </span>
            <Badge variant="outline">{preview.type_name || "Sin tipo"}</Badge>
          </div>
          <p className="font-semibold leading-tight text-ezi-gray">
            {preview.name}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <ReadOnlyField label="Marca" value={preview.brand} />
            <ReadOnlyField label="Modelo" value={preview.model} />
            <ReadOnlyField label="Serie" value={preview.serial_number} />
            <ReadOnlyField label="Planta" value={preview.plant_name} />
          </dl>
          {selectedId === preview.asset_id ? (
            <p className="text-center text-xs font-medium text-green-700">
              Asignado como padre
            </p>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={disabled}
              onClick={() => onSelect(preview.asset_id)}
            >
              Asignar como padre
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Selecciona un equipo para ver su tarjeta.
        </p>
      )}
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate">
        {value ? value : <span className="text-muted-foreground">—</span>}
      </dd>
    </>
  );
}

