"use client";

import * as React from "react";
import { ImagePlus, Search, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  MONTHS_ES,
  useMachineForm,
} from "@/modules/maintenance/hooks/use-machine-form";
import type {
  CellOption,
  LocationOption,
  PlantOption,
} from "@/modules/maintenance/components/machine-form-dialog";

/** `YYYY-MM-…` → "marzo 2021" (the day is a placeholder, always 01). */
function installationLabel(iso: string | null): string | null {
  if (!iso) return null;
  const year = iso.slice(0, 4);
  const month = Number(iso.slice(5, 7));
  const name = MONTHS_ES[month - 1]?.toLowerCase();
  return name ? `${name} ${year}` : year;
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

export function SummaryFields({
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
                      className={cn(buttonVariants({ variant: "ghost-ezi", size: "icon-xs" }))}
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
