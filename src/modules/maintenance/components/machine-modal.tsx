"use client";

import * as React from "react";
import {
  ArrowLeft,
  Check,
  Pencil,
  QrCode,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useOptionalExpandingModal } from "@/components/kit/expanding-modal";
import { useCan } from "@/components/providers/permissions-provider";
import { useMachineForm } from "@/modules/maintenance/hooks/use-machine-form";
import { useAssetDetail } from "@/modules/maintenance/hooks/use-asset-detail";
import { useCellAssignment } from "@/modules/maintenance/hooks/use-cell-assignment";
import { SummaryFields } from "@/modules/maintenance/components/machine-summary-fields";
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

  // Only read by `useMachineForm`'s `useState` initializers on first mount —
  // this component instance is remounted (via `key`) whenever a different
  // asset opens, so a fresh value here each render is never stale.
  const form = useMachineForm({
    asset: row ? rowToFormAsset(row) : null,
    types,
    parents,
    onSaved: (mode, assetId) => {
      void (async () => {
        await cellAssignment.sync(assetId);
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
  const cellAssignment = useCellAssignment(canAssignCell, currentAssignment);

  function cancelEdit() {
    if (isCreate) {
      // Explicit "Cancelar" click, not a backdrop/Escape dismiss — must always
      // close even though `editing` (still true here) keeps the guarded
      // `requestClose` a no-op via `closeDisabled`.
      requestCloseForce?.();
      return;
    }
    form.cancel();
    cellAssignment.reset();
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

      {form.error || cellAssignment.error ? (
        <p className="mx-6 mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {form.error ?? cellAssignment.error}
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
          pendingCellId={cellAssignment.pendingCellId}
          onPendingCellChange={cellAssignment.setPendingCellId}
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
