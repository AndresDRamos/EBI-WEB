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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useOptionalExpandingModal } from "@/components/kit/expanding-modal";
import { useCan } from "@/components/providers/permissions-provider";
import {
  MONTHS_ES,
  useMachineForm,
} from "@/modules/maintenance/hooks/use-machine-form";
import { useAssetDetail } from "@/modules/maintenance/hooks/use-asset-detail";
import {
  type CellOption,
  type LocationOption,
  type MachineFormAsset,
  type ParentOption,
  type PlantOption,
  type TypeOption,
} from "@/modules/maintenance/components/machine-form-dialog";
import {
  DocumentosTab,
  MantenimientoTab,
  RestriccionesTab,
} from "@/modules/maintenance/components/machine-tabs";
import { QrModal } from "@/modules/maintenance/components/qr-modal";
import { ParentPickerModal } from "@/modules/maintenance/components/parent-picker-modal";
import type { MachineRow } from "@/modules/maintenance/components/machines-cards-page";
import { cn } from "@/lib/utils";
import { apiMutate } from "@/lib/api-client";

type TabId = "mantenimiento" | "documentacion" | "restricciones";

const TABS: { id: TabId; label: string }[] = [
  { id: "mantenimiento", label: "Mantenimiento" },
  { id: "documentacion", label: "Documentación" },
  { id: "restricciones", label: "Restricciones" },
];

function rowToFormAsset(row: MachineRow): MachineFormAsset {
  return {
    asset_id: row.asset_id,
    code: row.code,
    name: row.name,
    brand: row.brand,
    model: row.model,
    serial_number: row.serial_number,
    location_id: row.location_id,
    asset_type_id: row.asset_type_id,
    parent_asset_id: row.parent_asset_id,
    installation_date: row.installation_date,
    image_blob_path: row.image_blob_path,
    notes: row.notes,
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
  locations: LocationOption[];
  cells: CellOption[];
  types: TypeOption[];
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
  /** True when rendered on a full page (QR landing) instead of inside an
   * ExpandingModal — hides the back button. */
  standalone?: boolean;
}

/**
 * Unified view/edit/create surface for a maintenance asset — the content of
 * the `ExpandingModal` shell AND of the layout-less QR landing page
 * (`standalone`). V18 redesign: large photo on the left; identity fields on
 * the right; a Ubicación row (planta derivada · ubicación · celda — the cell
 * options are filtered to the asset's location); status is neither shown nor
 * editable; header actions are icon-only (QR / trash / pencil); tabs are
 * Mantenimiento (representative), Documentación and Restricciones.
 */
export function MachineModal({
  row,
  plants,
  locations,
  cells,
  types,
  parents,
  isActive,
  editing,
  onEditingChange,
  onRequestDeactivate,
  onRestore,
  onMutated,
  standalone = false,
}: MachineModalProps) {
  const can = useCan();
  const modalCtx = useOptionalExpandingModal();
  const requestClose = modalCtx?.requestClose;
  const requestCloseForce = modalCtx?.requestCloseForce;
  const canAssignCell =
    can("production.assignment:create") && can("production.assignment:close");

  const [tab, setTab] = React.useState<TabId>("mantenimiento");
  const [qrOpen, setQrOpen] = React.useState(false);
  const [cellError, setCellError] = React.useState<string | null>(null);
  // The user's pending cell choice while editing; null = "Sin celda",
  // undefined = untouched (keep whatever is currently assigned).
  const [pendingCellId, setPendingCellId] = React.useState<number | null | undefined>(
    undefined,
  );

  // Only read by `useMachineForm`'s `useState` initializers on first mount —
  // this component instance is remounted (via `key`) whenever a different
  // asset opens, so a fresh value here each render is never stale.
  const form = useMachineForm({
    asset: row ? rowToFormAsset(row) : null,
    types,
    parents,
    onSaved: (mode, assetId) => {
      void (async () => {
        await syncCellAssignment(assetId);
        onEditingChange(false);
        onMutated();
        if (mode === "updated") detail.refetch();
      })();
    },
  });

  const isCreate = form.saved === null;
  const assetId = form.saved?.asset_id ?? null;
  const detail = useAssetDetail(assetId);

  const currentAssignments = (detail.data?.assignments ?? []).filter(
    (a) => a.valid_to === null,
  );
  const currentAssignment = currentAssignments[0] ?? null;

  /** Reconcile the pending cell choice with the live assignment after save:
   * close the current row and/or open a new one via the production APIs. */
  async function syncCellAssignment(savedAssetId: number) {
    if (!canAssignCell || pendingCellId === undefined) return;
    setCellError(null);
    try {
      const targetCellId = pendingCellId;
      const current = currentAssignment;
      if (current && current.cell_id === targetCellId) return;
      if (current) {
        // The server may have closed it already if the location changed —
        // a 409 ("already closed") is fine, anything else surfaces.
        const res = await fetch(
          `/api/production/assignments/${current.assignment_id}/close`,
          { method: "POST" },
        );
        if (!res.ok && res.status !== 409) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(d.error ?? "No se pudo cerrar la asignación de celda.");
        }
      }
      if (targetCellId !== null) {
        await apiMutate(`/api/production/cells/${targetCellId}/assignments`, {
          method: "POST",
          body: { asset_id: savedAssetId },
          fallback: "No se pudo asignar la celda.",
        });
      }
    } catch (err) {
      setCellError(
        err instanceof Error ? err.message : "No se pudo actualizar la celda.",
      );
    } finally {
      setPendingCellId(undefined);
    }
  }

  function cancelEdit() {
    if (isCreate) {
      // Explicit "Cancelar" click, not a backdrop/Escape dismiss — must always
      // close even though `editing` (still true here) keeps the guarded
      // `requestClose` a no-op via `closeDisabled`.
      requestCloseForce?.();
      return;
    }
    form.cancel();
    setPendingCellId(undefined);
    setCellError(null);
    onEditingChange(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 px-6 pt-5">
        <div className="flex min-w-0 items-center gap-3">
          {!standalone ? (
            <button
              type="button"
              onClick={() => requestClose?.()}
              disabled={editing}
              aria-label="Volver a equipos"
              className="-ml-1.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-ezi-gray">
                {isCreate ? "Nuevo equipo" : form.fields.name || "Equipo"}
              </h2>
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-9 px-0"
                    onClick={() => setQrOpen(true)}
                    aria-label="Etiqueta QR"
                  >
                    <QrCode className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Etiqueta QR</TooltipContent>
              </Tooltip>
              {isActive
                ? can("maintenance.asset:delete") && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-9 px-0 text-destructive hover:bg-red-50"
                          onClick={() =>
                            form.saved &&
                            onRequestDeactivate(
                              form.saved.asset_id,
                              form.saved.code,
                              form.fields.name,
                            )
                          }
                          aria-label="Desechar equipo"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Desechar equipo</TooltipContent>
                    </Tooltip>
                  )
                : can("maintenance.asset:update") && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-9 px-0"
                          onClick={() => assetId !== null && onRestore(assetId)}
                          aria-label="Reactivar equipo"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Reactivar equipo</TooltipContent>
                    </Tooltip>
                  )}
              {can("maintenance.asset:update") ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="w-9 px-0"
                      onClick={() => onEditingChange(true)}
                      aria-label="Editar equipo"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Editar equipo</TooltipContent>
                </Tooltip>
              ) : null}
            </>
          )}
        </div>
      </div>

      {form.error || cellError ? (
        <p className="mx-6 mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {form.error ?? cellError}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <SummaryFields
          form={form}
          plants={plants}
          locations={locations}
          cells={cells}
          editing={editing}
          canAssignCell={canAssignCell}
          currentCellNames={
            detail.data
              ? currentAssignments.map((a) => a.cell_name)
              : (row?.cell_names ?? [])
          }
          currentCellId={currentAssignment?.cell_id ?? null}
          pendingCellId={pendingCellId}
          onPendingCellChange={setPendingCellId}
        />

        {!isCreate ? (
          <>
            <hr className="mx-6 mt-2 border-t" />
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
              {tab === "mantenimiento" ? (
                <MantenimientoTab />
              ) : detail.error ? (
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
                  {tab === "restricciones" && assetId !== null ? (
                    <RestriccionesTab
                      assetId={assetId}
                      restrictions={detail.data?.restrictions ?? []}
                      onChanged={detail.refetch}
                    />
                  ) : null}
                  {tab === "documentacion" && assetId !== null ? (
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

      {form.parentPanelOpen ? (
        <ParentPickerModal
          choices={form.parentChoices}
          selectedId={form.fields.parentId}
          onSelect={(id) => form.fields.setParentId(id)}
          onClose={() => form.setParentPanelOpen(false)}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary panel — always visible; toggles between read-only and editable.
// Layout: large photo + identity fields (name, brand/model/serial, a
// Categoría → Tipo cascade) on top; a boxed "Ubicación" section in the
// middle (Planta → Ubicación → Celda, each filtering the next, revealed one
// at a time while editing); then a divider and a "Detalles" section
// (installation date, parent asset, notes) at the bottom.
// ---------------------------------------------------------------------------

/** Progressive-reveal wrapper for a cascade step that only mounts once its
 * prerequisite is chosen — the enter transition is what makes each field
 * feel like it "appears after" the previous one. */
const REVEAL_CLASS = "animate-in fade-in-0 slide-in-from-top-1 duration-200";

function FieldSlot({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function ReadValue({
  big,
  children,
}: {
  big?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[38px] items-center text-ezi-gray",
        big ? "text-xl font-semibold" : "text-sm",
      )}
    >
      {children || <span className="text-muted-foreground">—</span>}
    </div>
  );
}

function SummaryFields({
  form,
  plants,
  locations,
  cells,
  editing,
  canAssignCell,
  currentCellNames,
  currentCellId,
  pendingCellId,
  onPendingCellChange,
}: {
  form: ReturnType<typeof useMachineForm>;
  plants: PlantOption[];
  locations: LocationOption[];
  cells: CellOption[];
  editing: boolean;
  canAssignCell: boolean;
  currentCellNames: string[];
  currentCellId: number | null;
  pendingCellId: number | null | undefined;
  onPendingCellChange: (v: number | null | undefined) => void;
}) {
  const { fields } = form;
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const selectedLocation = locations.find(
    (l) => String(l.location_id) === fields.locationId,
  );
  const locationCells = cells.filter(
    (c) => c.location_id !== null && String(c.location_id) === fields.locationId,
  );
  // Editing value for the cell select: pending choice wins; otherwise mirror
  // the live assignment.
  const cellSelectValue =
    pendingCellId !== undefined
      ? pendingCellId === null
        ? ""
        : String(pendingCellId)
      : currentCellId !== null
        ? String(currentCellId)
        : "";

  // Categoría → Tipo cascade. `categoryId` is a pure UI filter (the asset
  // only stores `asset_type_id`; the category is derived) — lazy-initialized
  // from the current type so an existing asset opens with both steps already
  // revealed, not needing to be re-picked.
  const [categoryId, setCategoryId] = React.useState<string>(() =>
    form.selectedType ? String(form.selectedType.asset_category_id) : "",
  );
  const categoryOptions = form.typeGroups.map((g) => ({
    asset_category_id: g.asset_category_id,
    name: g.category,
  }));
  const categoryTypes =
    form.typeGroups.find((g) => String(g.asset_category_id) === categoryId)
      ?.items ?? [];

  // Planta → Ubicación → Celda cascade. `plantId` is likewise a pure UI
  // filter — the asset stores `location_id` only, plant is derived from it —
  // lazy-initialized from the current location for the same reason.
  const [plantId, setPlantId] = React.useState<string>(() =>
    selectedLocation ? String(selectedLocation.plant_id) : "",
  );
  const plantLocations = locations.filter((l) => String(l.plant_id) === plantId);

  return (
    <div className="flex flex-shrink-0 flex-col gap-4 px-6 py-4">
      <div className="flex gap-6">
        {/* Photo — the mock gives it real presence, not a thumbnail. */}
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
              "relative flex h-56 w-56 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 text-muted-foreground transition-colors",
              editing
                ? "border-dashed hover:border-ezi-orange/60 hover:text-ezi-orange"
                : "border-solid",
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
                <ImagePlus className="h-8 w-8" />
                <span className="px-2 text-center text-xs leading-tight">
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

        {/* Identity fields — name, brand/model/serial, category/type. */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <FieldSlot label="Nombre">
            {editing ? (
              <Input
                value={fields.name}
                onChange={(e) => fields.setName(e.target.value)}
                maxLength={200}
                disabled={form.busy}
              />
            ) : (
              <ReadValue big>{fields.name}</ReadValue>
            )}
          </FieldSlot>

          <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-3">
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
          </div>

          {/* Categoría → Tipo cascade: category first, type only once a
              category is chosen (already-set assets open with both revealed). */}
          <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-3">
            <FieldSlot label="Categoría">
              {editing ? (
                <Select
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    fields.setTypeId("");
                  }}
                  disabled={form.busy || categoryOptions.length === 0}
                >
                  <option value="">Selecciona…</option>
                  {categoryOptions.map((c) => (
                    <option key={c.asset_category_id} value={c.asset_category_id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <ReadValue>{form.selectedType?.category_name}</ReadValue>
              )}
            </FieldSlot>
            {editing ? (
              categoryId ? (
                <FieldSlot
                  label="Tipo de equipo"
                  className={cn("sm:col-span-2", REVEAL_CLASS)}
                >
                  <Select
                    value={fields.typeId}
                    onChange={(e) => fields.setTypeId(e.target.value)}
                    disabled={form.busy || categoryTypes.length === 0}
                  >
                    <option value="">
                      {categoryTypes.length === 0
                        ? "Sin tipos en esta categoría"
                        : "Selecciona…"}
                    </option>
                    {categoryTypes.map((t) => (
                      <option key={t.asset_type_id} value={t.asset_type_id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                  {form.selectedType &&
                  form.selectedType.process_names.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Proceso:{" "}
                      <span className="font-medium text-ezi-gray">
                        {form.selectedType.process_names.join(", ")}
                      </span>
                    </p>
                  ) : null}
                </FieldSlot>
              ) : null
            ) : (
              <FieldSlot label="Tipo de equipo" className="sm:col-span-2">
                <ReadValue>{form.selectedType?.name}</ReadValue>
              </FieldSlot>
            )}
          </div>
        </div>
      </div>

      {/* Ubicación — planta → ubicación → celda, each filtering the next. */}
      <div className="rounded-lg border bg-gray-50/60 p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Ubicación
        </p>
        <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-3">
          <FieldSlot label="Planta">
            {editing ? (
              <Select
                value={plantId}
                onChange={(e) => {
                  setPlantId(e.target.value);
                  fields.setLocationId("");
                  onPendingCellChange(null);
                }}
                disabled={form.busy || plants.length === 0}
              >
                <option value="">Selecciona…</option>
                {plants.map((p) => (
                  <option key={p.plant_id} value={p.plant_id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            ) : (
              <ReadValue>{selectedLocation?.plant_name}</ReadValue>
            )}
          </FieldSlot>

          {editing ? (
            plantId ? (
              <FieldSlot label="Ubicación" className={REVEAL_CLASS}>
                <Select
                  value={fields.locationId}
                  onChange={(e) => {
                    fields.setLocationId(e.target.value);
                    // A different location invalidates the cell: default to none.
                    onPendingCellChange(null);
                  }}
                  disabled={form.busy || plantLocations.length === 0}
                >
                  <option value="">
                    {plantLocations.length === 0
                      ? "Sin ubicaciones en esta planta"
                      : "Selecciona…"}
                  </option>
                  {plantLocations.map((l) => (
                    <option key={l.location_id} value={l.location_id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </FieldSlot>
            ) : null
          ) : (
            <FieldSlot label="Ubicación">
              <ReadValue>{selectedLocation?.name}</ReadValue>
            </FieldSlot>
          )}

          {editing ? (
            canAssignCell ? (
              fields.locationId ? (
                <FieldSlot label="Celda de producción" className={REVEAL_CLASS}>
                  <Select
                    value={cellSelectValue}
                    onChange={(e) =>
                      onPendingCellChange(
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                    disabled={form.busy || locationCells.length === 0}
                  >
                    <option value="">
                      {locationCells.length === 0
                        ? "Sin celdas en esta ubicación"
                        : "Sin celda"}
                    </option>
                    {locationCells.map((c) => (
                      <option key={c.cell_id} value={c.cell_id}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Solo celdas en la misma ubicación del equipo.
                  </p>
                </FieldSlot>
              ) : null
            ) : (
              <FieldSlot label="Celda de producción">
                <ReadValue>
                  {currentCellNames.length > 0 ? currentCellNames.join(", ") : null}
                </ReadValue>
              </FieldSlot>
            )
          ) : (
            <FieldSlot label="Celda de producción">
              <ReadValue>
                {currentCellNames.length > 0 ? currentCellNames.join(", ") : null}
              </ReadValue>
            </FieldSlot>
          )}
        </div>
      </div>

      <hr className="border-t" />

      {/* Detalles — installation date, parent asset, notes. Notas gets the
          full width (its own row) instead of a cramped third column, but a
          shorter textarea so it doesn't stretch the modal. */}
      <div>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Detalles
        </p>
        <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
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
                  ? installationLabel(
                      `${fields.installYear}-${fields.installMonth}-01`,
                    )
                  : null}
              </ReadValue>
            )}
          </FieldSlot>
          <FieldSlot label="Equipo padre">
            {editing ? (
              <div className="space-y-2">
                {form.selectedParent ? (
                  <div className="flex h-9 items-center gap-2 rounded-md border bg-gray-50 px-3">
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
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={form.busy}
                    onClick={() => form.setParentPanelOpen(true)}
                    className="w-full justify-start"
                  >
                    <Search className="h-3.5 w-3.5" />
                    Buscar equipo padre
                  </Button>
                )}
                {form.selectedParent ? (
                  <button
                    type="button"
                    onClick={() => form.setParentPanelOpen(true)}
                    disabled={form.busy}
                    className="text-xs font-medium text-ezi-orange hover:text-orange-700"
                  >
                    Cambiar equipo padre
                  </button>
                ) : null}
              </div>
            ) : (
              <ReadValue>
                {form.selectedParent ? (
                  <span className="font-mono text-sm">
                    {form.selectedParent.code}
                  </span>
                ) : null}
              </ReadValue>
            )}
          </FieldSlot>
        </div>

        <div className="mt-3">
          <FieldSlot label="Notas">
            {editing ? (
              <Textarea
                value={fields.notes}
                onChange={(e) => fields.setNotes(e.target.value)}
                maxLength={2000}
                rows={2}
                disabled={form.busy}
              />
            ) : (
              <ReadValue>
                <span className="whitespace-pre-wrap text-sm">{fields.notes}</span>
              </ReadValue>
            )}
          </FieldSlot>
        </div>
      </div>
    </div>
  );
}
