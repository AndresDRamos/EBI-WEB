"use client";

import * as React from "react";
import {
  ArrowLeft,
  Check,
  ImagePlus,
  Pencil,
  QrCode,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useExpandingModal } from "@/components/kit/expanding-modal";
import { useCan } from "@/components/providers/permissions-provider";
import {
  MONTHS_ES,
  useMachineForm,
} from "@/modules/maintenance/hooks/use-machine-form";
import { useAssetDetail } from "@/modules/maintenance/hooks/use-asset-detail";
import {
  ParentSearchPanel,
  type MachineFormAsset,
  type ParentOption,
  type PlantOption,
  type ProcessOption,
  type TypeOption,
} from "@/modules/maintenance/components/machine-form-dialog";
import {
  DocumentosTab,
  ProcesosTab,
  RestriccionesTab,
  UbicacionTab,
} from "@/modules/maintenance/components/machine-tabs";
import { StatusBadge } from "@/modules/maintenance/components/machine-badges";
import { QrModal } from "@/modules/maintenance/components/qr-modal";
import type { MachineRow } from "@/modules/maintenance/components/machines-cards-page";
import { ASSET_STATUSES, statusLabel } from "@/modules/maintenance/enums";
import { cn } from "@/lib/utils";

type TabId = "procesos" | "ubicacion" | "restricciones" | "documentos";

const TABS: { id: TabId; label: string }[] = [
  { id: "procesos", label: "Procesos" },
  { id: "ubicacion", label: "Ubicación" },
  { id: "restricciones", label: "Restricciones" },
  { id: "documentos", label: "Documentos" },
];

function rowToFormAsset(row: MachineRow): MachineFormAsset {
  return {
    asset_id: row.asset_id,
    code: row.code,
    name: row.name,
    brand: row.brand,
    model: row.model,
    serial_number: row.serial_number,
    plant_id: row.plant_id,
    status: row.status,
    asset_type_id: row.asset_type_id,
    parent_asset_id: row.parent_asset_id,
    installation_date: row.installation_date,
    image_blob_path: row.image_blob_path,
    notes: row.notes,
    process_ids: row.process_ids,
  };
}

/** `YYYY-MM-…` → "marzo 2021" (the day is a placeholder, always 01). */
function installationLabel(iso: string | null): string | null {
  if (!iso) return null;
  const year = iso.slice(0, 4);
  const month = Number(iso.slice(5, 7));
  const name = MONTHS_ES[month - 1]?.toLowerCase();
  return name ? `${name} ${year}` : year;
}

export interface MachineModalProps {
  /** null = creating a new asset. */
  row: MachineRow | null;
  plants: PlantOption[];
  types: TypeOption[];
  processes: ProcessOption[];
  parents: ParentOption[];
  /** Whether the asset is currently active — lifted to the caller so a
   * deactivate/restore triggered from this modal's header reflects instantly
   * without waiting on the underlying list to refetch. */
  isActive: boolean;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onRequestDeactivate: (assetId: number, code: string, name: string) => void;
  onRestore: (assetId: number) => void;
  /** Fires after create/edit/deactivate/restore succeed so the caller can
   * refresh the underlying list without closing this modal. */
  onMutated: () => void;
}

/**
 * Unified view/edit/create surface for a maintenance asset — the content of
 * the `ExpandingModal` shell. Replaces the old page-level `MachineDetail` +
 * the separate Radix `MachineFormDialog`: a summary panel that toggles
 * between read-only and editable in place, plus the real Procesos/Ubicación/
 * Restricciones/Documentos tabs (unchanged business logic, moved as-is from
 * `machine-detail.tsx` into `machine-tabs.tsx`).
 */
export function MachineModal({
  row,
  plants,
  types,
  processes,
  parents,
  isActive,
  editing,
  onEditingChange,
  onRequestDeactivate,
  onRestore,
  onMutated,
}: MachineModalProps) {
  const can = useCan();
  const { requestClose } = useExpandingModal();
  // Only read by `useMachineForm`'s `useState` initializers on first mount —
  // this component instance is remounted (via `key`) whenever a different
  // asset opens, so a fresh value here each render is never stale.
  const form = useMachineForm({
    asset: row ? rowToFormAsset(row) : null,
    types,
    parents,
    onSaved: () => {
      onEditingChange(false);
      onMutated();
    },
  });
  const [tab, setTab] = React.useState<TabId>("procesos");
  const [qrOpen, setQrOpen] = React.useState(false);
  const [processIds, setProcessIds] = React.useState<number[]>(
    row?.process_ids ?? [],
  );

  const isCreate = form.saved === null;
  const assetId = form.saved?.asset_id ?? null;
  const detail = useAssetDetail(assetId);

  function cancelEdit() {
    if (isCreate) {
      requestClose();
      return;
    }
    form.cancel();
    onEditingChange(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 px-6 pt-5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={requestClose}
            disabled={editing}
            aria-label="Volver a equipos"
            className="-ml-1.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-ezi-gray">
                {isCreate ? "Nuevo equipo" : form.fields.name || "Equipo"}
              </h2>
              {!isCreate ? <StatusBadge value={form.fields.status} /> : null}
              {!isCreate && !isActive ? (
                <Badge variant="outline" className="border-gray-300 text-gray-500">
                  Inactivo
                </Badge>
              ) : null}
            </div>
            {!isCreate ? (
              <p className="font-mono text-sm text-muted-foreground">
                {form.saved?.code}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={cancelEdit} disabled={form.busy}>
                <X className="h-4 w-4" />
                Cancelar
              </Button>
              <Button onClick={() => void form.submit()} disabled={form.busy}>
                <Check className="h-4 w-4" />
                {form.busy
                  ? "Guardando…"
                  : isCreate
                    ? "Crear equipo"
                    : "Guardar cambios"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setQrOpen(true)}>
                <QrCode className="h-4 w-4" />
                Etiqueta QR
              </Button>
              {isActive
                ? can("maintenance.asset:delete") && (
                    <Button
                      variant="outline"
                      className="text-destructive hover:bg-red-50"
                      onClick={() =>
                        form.saved &&
                        onRequestDeactivate(
                          form.saved.asset_id,
                          form.saved.code,
                          form.fields.name,
                        )
                      }
                      aria-label="Desactivar equipo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )
                : can("maintenance.asset:update") && (
                    <Button
                      variant="outline"
                      onClick={() => assetId !== null && onRestore(assetId)}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reactivar
                    </Button>
                  )}
              {can("maintenance.asset:update") ? (
                <Button onClick={() => onEditingChange(true)}>
                  <Pencil className="h-4 w-4" />
                  Editar
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {form.error ? (
        <p className="mx-6 mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {form.error}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <SummaryFields form={form} plants={plants} editing={editing} />
        <hr className="mx-6 mt-2 border-t" />

        {!isCreate ? (
          <>
            <div role="tablist" className="flex flex-shrink-0 gap-1 border-b px-6 pt-3">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "-mb-px border-b-2 px-4 py-2 text-sm transition-colors",
                    tab === t.id
                      ? "border-ezi-orange font-semibold text-ezi-gray"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="px-6 py-4">
              {detail.error ? (
                <p className="rounded-lg border bg-card p-4 text-sm text-destructive">
                  {detail.error}{" "}
                  <button
                    type="button"
                    onClick={detail.refetch}
                    className="font-semibold underline"
                  >
                    Reintentar
                  </button>
                </p>
              ) : detail.loading ? (
                <div className="h-24 animate-pulse rounded-lg border bg-gray-50" />
              ) : (
                <>
                  {tab === "procesos" && assetId !== null ? (
                    <ProcesosTab
                      assetId={assetId}
                      assetProcessIds={processIds}
                      allProcesses={processes}
                      onChanged={(ids) => {
                        setProcessIds(ids);
                        onMutated();
                      }}
                    />
                  ) : null}
                  {tab === "ubicacion" ? (
                    <UbicacionTab assignments={detail.data?.assignments ?? []} />
                  ) : null}
                  {tab === "restricciones" && assetId !== null ? (
                    <RestriccionesTab
                      assetId={assetId}
                      restrictions={detail.data?.restrictions ?? []}
                      onChanged={detail.refetch}
                    />
                  ) : null}
                  {tab === "documentos" && assetId !== null ? (
                    <DocumentosTab
                      assetId={assetId}
                      documents={detail.data?.documents ?? []}
                      onChanged={detail.refetch}
                    />
                  ) : null}
                </>
              )}
            </div>
          </>
        ) : null}
      </div>

      {qrOpen && form.saved ? (
        <QrModal
          assetId={form.saved.asset_id}
          code={form.saved.code}
          name={form.fields.name}
          onClose={() => setQrOpen(false)}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary panel — always visible; toggles between read-only and editable.
// ---------------------------------------------------------------------------

function FieldSlot({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", full && "sm:col-span-2 lg:col-span-3")}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function ReadValue({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-h-[38px] items-center text-sm text-ezi-gray">
      {children || <span className="text-muted-foreground">—</span>}
    </div>
  );
}

function SummaryFields({
  form,
  plants,
  editing,
}: {
  form: ReturnType<typeof useMachineForm>;
  plants: PlantOption[];
  editing: boolean;
}) {
  const { fields } = form;
  const plantName = plants.find((p) => String(p.plant_id) === fields.plantId)?.name;
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-shrink-0 gap-6 px-6 py-4">
      <div className="shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void form.onPickImage(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => editing && fileInputRef.current?.click()}
          disabled={!editing || form.busy || form.imageBusy}
          className={cn(
            "relative flex h-32 w-32 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border-2 text-muted-foreground transition-colors",
            editing ? "border-dashed hover:border-ezi-orange/60 hover:text-ezi-orange" : "border-solid",
            form.imageSrc && "border-solid",
          )}
          aria-label="Imagen del equipo"
        >
          {form.imageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob/object URLs don't go through the Next image optimizer
            <img
              src={form.imageSrc}
              alt="Imagen del equipo"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <>
              <ImagePlus className="h-6 w-6" />
              <span className="px-2 text-center text-[10px] leading-tight">
                {form.imageBusy ? "Subiendo…" : "Imagen del equipo"}
              </span>
            </>
          )}
        </button>
        {editing && form.imageSrc ? (
          <button
            type="button"
            onClick={form.removeImage}
            disabled={form.busy || form.imageBusy}
            className="mt-1 w-full text-center text-[10px] text-muted-foreground hover:text-ezi-orange"
          >
            Quitar imagen
          </button>
        ) : null}
      </div>

      <div className="grid min-w-0 flex-1 grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <FieldSlot label="Nombre" full>
          {editing ? (
            <Input
              value={fields.name}
              onChange={(e) => fields.setName(e.target.value)}
              maxLength={200}
              disabled={form.busy}
            />
          ) : (
            <ReadValue>{fields.name}</ReadValue>
          )}
        </FieldSlot>

        <FieldSlot label="Marca">
          {editing ? (
            <Input
              value={fields.brand}
              onChange={(e) => fields.setBrand(e.target.value)}
              maxLength={120}
              disabled={form.busy}
            />
          ) : (
            <ReadValue>{fields.brand}</ReadValue>
          )}
        </FieldSlot>
        <FieldSlot label="Modelo">
          {editing ? (
            <Input
              value={fields.model}
              onChange={(e) => fields.setModel(e.target.value)}
              maxLength={120}
              disabled={form.busy}
            />
          ) : (
            <ReadValue>{fields.model}</ReadValue>
          )}
        </FieldSlot>
        <FieldSlot label="Número de serie">
          {editing ? (
            <Input
              value={fields.serial}
              onChange={(e) => fields.setSerial(e.target.value)}
              maxLength={120}
              disabled={form.busy}
            />
          ) : (
            <ReadValue>{fields.serial}</ReadValue>
          )}
        </FieldSlot>

        <FieldSlot label="Tipo de equipo">
          {editing ? (
            <>
              <Select
                value={fields.typeId}
                onChange={(e) => fields.setTypeId(e.target.value)}
                disabled={form.busy || form.noTypes}
              >
                <option value="">Selecciona…</option>
                {form.typeGroups.map((g) => (
                  <optgroup key={g.category} label={g.category}>
                    {g.items.map((t) => (
                      <option key={t.asset_type_id} value={t.asset_type_id}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
              {form.selectedType ? (
                <p className="text-xs text-muted-foreground">
                  Categoría:{" "}
                  <span className="font-medium text-ezi-gray">
                    {form.selectedType.category_name}
                  </span>
                </p>
              ) : null}
            </>
          ) : (
            <ReadValue>{form.selectedType?.name}</ReadValue>
          )}
        </FieldSlot>
        <FieldSlot label="Categoría">
          <ReadValue>{form.selectedType?.category_name}</ReadValue>
        </FieldSlot>
        <FieldSlot label="Planta">
          {editing ? (
            <Select
              value={fields.plantId}
              onChange={(e) => fields.setPlantId(e.target.value)}
              disabled={form.busy}
            >
              <option value="">Selecciona…</option>
              {plants.map((p) => (
                <option key={p.plant_id} value={p.plant_id}>
                  {p.name}
                </option>
              ))}
            </Select>
          ) : (
            <ReadValue>{plantName}</ReadValue>
          )}
        </FieldSlot>

        <FieldSlot label="Estatus">
          {editing ? (
            <Select
              value={fields.status}
              onChange={(e) => fields.setStatus(e.target.value)}
              disabled={form.busy}
            >
              {ASSET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </Select>
          ) : (
            <ReadValue>
              <StatusBadge value={fields.status} />
            </ReadValue>
          )}
        </FieldSlot>
        <FieldSlot label="Fecha de instalación">
          {editing ? (
            <div className="grid grid-cols-2 gap-2">
              <Select
                aria-label="Mes de instalación"
                value={fields.installMonth}
                onChange={(e) => fields.setInstallMonth(e.target.value)}
                disabled={form.busy}
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
                value={fields.installYear}
                onChange={(e) => fields.setInstallYear(e.target.value)}
                disabled={form.busy}
              >
                <option value="">Año…</option>
                {form.years.map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <ReadValue>
              {fields.installMonth && fields.installYear
                ? installationLabel(`${fields.installYear}-${fields.installMonth}-01`)
                : null}
            </ReadValue>
          )}
        </FieldSlot>
        <FieldSlot label="Equipo padre">
          {editing ? (
            <div className="space-y-2">
              {form.selectedParent ? (
                <div className="flex items-center gap-2 rounded-md border bg-gray-50 px-3 py-2">
                  <span className="font-mono text-xs font-semibold text-muted-foreground">
                    {form.selectedParent.code}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {form.selectedParent.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => fields.setParentId(null)}
                    disabled={form.busy}
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
                disabled={form.busy}
                onClick={() => form.setParentPanelOpen((v) => !v)}
              >
                <Search className="h-3.5 w-3.5" />
                {form.parentPanelOpen
                  ? "Cerrar búsqueda"
                  : form.selectedParent
                    ? "Cambiar equipo padre"
                    : "Buscar equipo padre"}
              </Button>
            </div>
          ) : (
            <ReadValue>
              {form.selectedParent ? (
                <span className="font-mono text-sm">{form.selectedParent.code}</span>
              ) : null}
            </ReadValue>
          )}
        </FieldSlot>

        <FieldSlot label="Notas" full>
          {editing ? (
            <Textarea
              value={fields.notes}
              onChange={(e) => fields.setNotes(e.target.value)}
              maxLength={2000}
              rows={3}
              disabled={form.busy}
            />
          ) : (
            <ReadValue>
              <span className="whitespace-pre-wrap">{fields.notes}</span>
            </ReadValue>
          )}
        </FieldSlot>
      </div>

      {editing && form.parentPanelOpen ? (
        <ParentSearchPanel
          choices={form.parentChoices}
          selectedId={fields.parentId}
          onSelect={(id) => fields.setParentId(id)}
          disabled={form.busy}
        />
      ) : null}
    </div>
  );
}
