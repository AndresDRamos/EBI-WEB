"use client";

import * as React from "react";
import { ArrowLeft, MapPin } from "lucide-react";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { useExpandingModal } from "@/components/kit/expanding-modal";
import { useCan } from "@/components/providers/permissions-provider";
import { ApiError, apiMutate } from "@/lib/api-client";
import { CellDetailView } from "@/modules/production/components/cell-detail-view";
import { CellFormDialog } from "@/modules/production/components/cell-form-dialog";
import type { LocationCardOption } from "@/modules/production/components/operative-cells-page";
import type { OperativeCellRow } from "@/modules/production/db";

export type { OperativeCellRow };

export interface ProcessOption {
  process_id: number;
  name: string;
}

export type FormTarget =
  | { mode: "create"; parent: OperativeCellRow | null }
  | { mode: "edit"; cell: OperativeCellRow };

/**
 * Fades/slides its children in whenever `originKey` changes — used when
 * drilling from a cell into one of its children (and back), so the swap
 * reads as a continuation rather than a hard cut.
 */
function ExpandTransition({
  originKey,
  children,
}: {
  originKey: string | number;
  children: React.ReactNode;
}) {
  const [phase, setPhase] = React.useState<"opening" | "open">("opening");

  React.useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restarting the transition for a new target is the effect's purpose, not a derived-state mirror.
    setPhase("opening");
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPhase("open"));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [originKey]);

  return (
    <div
      style={{
        transformOrigin: "50% 0%",
        transform: phase === "opening" ? "scale(0.94) translateY(6px)" : "none",
        opacity: phase === "opening" ? 0 : 1,
        transitionProperty: "transform, opacity",
        transitionDuration: "280ms",
        transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)",
      }}
    >
      {children}
    </div>
  );
}

export function formatSize(cell: OperativeCellRow): string | null {
  if (cell.size_x_m === null || cell.size_y_m === null) return null;
  return `${Number(cell.size_x_m)} × ${Number(cell.size_y_m)} m`;
}

/**
 * Content of the cell-detail modal opened from a board card (see
 * `OperativeCellsPage`): the clicked cell's summary + children/operations +
 * read-only composition, with in-place drill-in to a child operation (back
 * pops that one level). Creation/edit reuse `CellFormDialog`; assignments are
 * managed from Mantenimiento → Equipos, so composition here stays read-only.
 */
export function CellDetailModal({
  rootCellId,
  location,
  plantName,
  cells,
  processes,
  onMutated,
}: {
  rootCellId: number;
  location: LocationCardOption;
  plantName: string;
  cells: OperativeCellRow[];
  processes: ProcessOption[];
  onMutated: () => void;
}) {
  const can = useCan();
  const { requestClose } = useExpandingModal();
  const [stack, setStack] = React.useState<number[]>([rootCellId]);
  const [form, setForm] = React.useState<FormTarget | null>(null);
  const [confirmTarget, setConfirmTarget] =
    React.useState<OperativeCellRow | null>(null);
  const [confirmBusy, setConfirmBusy] = React.useState(false);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);

  const currentId = stack[stack.length - 1];
  const currentCell = cells.find((c) => c.cell_id === currentId) ?? null;
  const children = currentCell
    ? cells
        .filter((c) => c.parent_cell_id === currentCell.cell_id)
        .sort(
          (a, b) =>
            (a.sequence_in_parent ?? Number.MAX_SAFE_INTEGER) -
            (b.sequence_in_parent ?? Number.MAX_SAFE_INTEGER),
        )
    : [];
  // Remounts CellDetailView whenever the cell or its children id SET changes
  // (an add/remove elsewhere), so its local draft-order state always starts
  // fresh off current props — no internal effect/setState-during-render
  // needed to detect that.
  const detailKey = currentCell
    ? `${currentCell.cell_id}:${children.map((c) => c.cell_id).sort((a, b) => a - b).join(",")}`
    : "none";

  function handleBack() {
    if (stack.length > 1) {
      setStack((s) => s.slice(0, -1));
    } else {
      requestClose();
    }
  }

  async function deactivate() {
    if (!confirmTarget) return;
    setConfirmError(null);
    setConfirmBusy(true);
    try {
      await apiMutate(`/api/production/cells/${confirmTarget.cell_id}`, {
        method: "PATCH",
        body: { is_active: false },
        fallback: "No se pudo desactivar la celda.",
      });
    } catch (err) {
      setConfirmBusy(false);
      setConfirmError(
        err instanceof ApiError ? err.message : "No se pudo completar la acción.",
      );
      return;
    }
    setConfirmBusy(false);
    setConfirmTarget(null);
    onMutated();
  }

  /** Reversible, so it runs on direct click without a confirm dialog. */
  async function restore(cellId: number) {
    await fetch(`/api/production/cells/${cellId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    }).catch(() => undefined);
    onMutated();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header — cell identity + back (into a child)/close. */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b px-6 py-4">
        {stack.length > 1 ? (
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground hover:bg-gray-100"
            aria-label="Volver a la celda anterior"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-sm bg-orange-50 text-ezi-orange">
            <MapPin className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-ezi-gray">
            {currentCell ? currentCell.name : location.name}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {currentCell ? (
              <>
                <span className="font-mono">{currentCell.code}</span>
                {" · "}
                {plantName}
                {" · "}
                {location.name}
              </>
            ) : (
              "Esta celda ya no existe."
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={requestClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground hover:bg-gray-100"
          aria-label="Cerrar"
        >
          <span aria-hidden className="text-lg leading-none">×</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {currentCell ? (
          <ExpandTransition originKey={currentCell.cell_id}>
            <CellDetailView
              key={detailKey}
              cell={currentCell}
              childrenCells={children}
              canCreate={can("production.cell:create")}
              canUpdate={can("production.cell:update")}
              onAddChild={() => setForm({ mode: "create", parent: currentCell })}
              onEdit={(c) => setForm({ mode: "edit", cell: c })}
              onDeactivate={(c) => {
                setConfirmError(null);
                setConfirmTarget(c);
              }}
              onRestore={(c) => void restore(c.cell_id)}
              onOpenChild={(c) => setStack((s) => [...s, c.cell_id])}
              onMutated={onMutated}
            />
          </ExpandTransition>
        ) : null}
      </div>

      <CellFormDialog
        target={form}
        location={location}
        plantName={plantName}
        processes={processes}
        onOpenChange={(open) => {
          if (!open) setForm(null);
        }}
        onSaved={() => {
          setForm(null);
          onMutated();
        }}
      />

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmTarget(null);
            setConfirmError(null);
          }
        }}
        title="¿Desactivar la celda?"
        description={
          confirmTarget
            ? `${confirmTarget.code} — ${confirmTarget.name} se marcará como inactiva. Podrás reactivarla después.`
            : ""
        }
        confirmLabel="Desactivar"
        busy={confirmBusy}
        error={confirmError}
        onConfirm={deactivate}
      />
    </div>
  );
}
