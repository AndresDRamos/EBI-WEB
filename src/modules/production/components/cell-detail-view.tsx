"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Pencil,
  Plus,
  RotateCcw,
  Ruler,
  Trash2,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { reorder } from "@/lib/reorder";
import { CellComposition } from "@/modules/production/components/cell-composition";
import {
  formatSize,
  type OperativeCellRow,
} from "@/modules/production/components/cell-detail-modal";
import { apiMutate } from "@/lib/api-client";

function cnRow(active: boolean): string {
  return active
    ? "flex items-center gap-3 py-2.5"
    : "flex items-center gap-3 py-2.5 opacity-60";
}

// ---------------------------------------------------------------------------
// Cell drill-in — summary + children (operations) + read-only composition
// ---------------------------------------------------------------------------

/** Remounted via `key` (cell id + children id set) by the caller — see
 * `LocationCellsModal` — so the local draft order below always starts fresh
 * off the current props, with no effect/setState-during-render needed to
 * detect "the underlying id set changed". */
export function CellDetailView({
  cell,
  childrenCells,
  canCreate,
  canUpdate,
  onAddChild,
  onEdit,
  onDeactivate,
  onRestore,
  onOpenChild,
  onMutated,
}: {
  cell: OperativeCellRow;
  childrenCells: OperativeCellRow[];
  canCreate: boolean;
  canUpdate: boolean;
  onAddChild: () => void;
  onEdit: (cell: OperativeCellRow) => void;
  onDeactivate: (cell: OperativeCellRow) => void;
  onRestore: (cell: OperativeCellRow) => void;
  onOpenChild: (cell: OperativeCellRow) => void;
  onMutated: () => void;
}) {
  const size = formatSize(cell);
  const isChild = cell.parent_cell_id !== null;
  const childrenById = React.useMemo(
    () => new Map(childrenCells.map((c) => [c.cell_id, c])),
    [childrenCells],
  );
  const savedIds = React.useMemo(
    () => childrenCells.map((c) => c.cell_id),
    [childrenCells],
  );

  // Local, in-memory draft order — drag and the up/down arrows only touch
  // this; nothing hits the network until "Guardar orden".
  const [order, setOrder] = React.useState<number[]>(savedIds);
  const [committedIds, setCommittedIds] = React.useState<number[]>(savedIds);
  const dirty = order.join(",") !== committedIds.join(",");
  const [saveBusy, setSaveBusy] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [dragId, setDragId] = React.useState<number | null>(null);

  function onDragOverRow(overId: number) {
    if (dragId === null || dragId === overId) return;
    setOrder((prev) => reorder(prev, dragId, overId));
  }

  /** Move `id` to sit right where its previous/next ACTIVE sibling is
   * (inactive rows are not reorder targets, but a move can still relocate an
   * item past one — same as dragging over it). */
  function moveActive(id: number, delta: -1 | 1) {
    setOrder((prev) => {
      let idx = prev.indexOf(id) + delta;
      while (idx >= 0 && idx < prev.length) {
        const neighborId = prev[idx];
        if (neighborId !== undefined && childrenById.get(neighborId)?.is_active) {
          return reorder(prev, id, neighborId);
        }
        idx += delta;
      }
      return prev;
    });
  }

  async function onSaveOrder() {
    setSaveError(null);
    setSaveBusy(true);
    try {
      await apiMutate(`/api/production/cells/${cell.cell_id}/children/reorder`, {
        body: { ordered_cell_ids: order },
        fallback: "No se pudo guardar el orden.",
      });
      setCommittedIds(order);
      onMutated();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setSaveBusy(false);
    }
  }

  function discardOrder() {
    setOrder(committedIds);
    setSaveError(null);
  }

  return (
    <div className="space-y-4">
      {/* Summary strip + row actions. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {size ? (
            <span className="flex items-center gap-1.5">
              <Ruler className="h-3.5 w-3.5" />
              {size}
            </span>
          ) : null}
          {cell.process_name ? (
            <span className="flex items-center gap-1.5">
              <Workflow className="h-3.5 w-3.5" />
              {cell.process_name}
            </span>
          ) : null}
          {isChild && cell.sequence_in_parent !== null ? (
            <Badge variant="outline">Op {cell.sequence_in_parent}</Badge>
          ) : null}
          {!cell.is_active ? (
            <Badge variant="outline" className="border-gray-300 text-gray-500">
              Inactiva
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {canUpdate ? (
            cell.is_active ? (
              <>
                <button
                  type="button"
                  onClick={() => onEdit(cell)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground hover:bg-gray-100 hover:text-ezi-gray"
                  aria-label="Editar celda"
                  title="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeactivate(cell)}
                  className={cn(buttonVariants({ variant: "ghost-ezi", size: "icon-md" }))}
                  aria-label="Desactivar celda"
                  title="Desactivar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onRestore(cell)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground hover:bg-gray-100 hover:text-ezi-gray"
                aria-label="Reactivar celda"
                title="Reactivar"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )
          ) : null}
        </div>
      </div>

      {/* Children (operations) — only for cells that are not children
          themselves (max depth 1, mirrored from the API rule). Reordering
          (drag or arrows) is purely local/instant; nothing is persisted
          until "Guardar orden" — same house pattern as the nav access tree's
          drag-order editor (`nav-access-tree.tsx`). */}
      {!isChild ? (
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Operaciones de la línea
            </p>
            {canCreate && cell.is_active ? (
              <Button variant="outline" size="sm" onClick={onAddChild}>
                <Plus className="h-3.5 w-3.5" />
                Añadir operación
              </Button>
            ) : null}
          </div>
          {order.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin operaciones: esta es una celda independiente. Al añadir
              operaciones se comporta como una línea de producción.
            </p>
          ) : (
            <ul className="divide-y">
              {order.map((childId, index) => {
                const child = childrenById.get(childId);
                if (!child) return null;
                const draggable = canUpdate && child.is_active;
                return (
                  <li
                    key={child.cell_id}
                    draggable={draggable}
                    onDragStart={() => setDragId(child.cell_id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      onDragOverRow(child.cell_id);
                    }}
                    onDrop={(e) => e.preventDefault()}
                    onDragEnd={() => setDragId(null)}
                    className={cn(
                      cnRow(child.is_active),
                      dragId === child.cell_id && "opacity-40",
                    )}
                  >
                    {draggable ? (
                      <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-gray-300" />
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )}
                    <span className="w-14 shrink-0 font-mono text-xs font-semibold text-ezi-orange">
                      Op {(index + 1) * 10}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenChild(child)}
                      className="shrink-0 font-mono text-sm font-medium text-ezi-gray underline-offset-2 hover:text-ezi-orange hover:underline"
                    >
                      {child.code}
                    </button>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {child.name}
                      {formatSize(child) ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {formatSize(child)}
                        </span>
                      ) : null}
                    </span>
                    {!child.is_active ? (
                      <Badge
                        variant="outline"
                        className="border-gray-300 text-gray-500"
                      >
                        Inactiva
                      </Badge>
                    ) : null}
                    {canUpdate && child.is_active ? (
                      <span className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => moveActive(child.cell_id, -1)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-transform hover:bg-gray-100 hover:text-ezi-gray active:-translate-y-0.5 disabled:opacity-30 disabled:active:translate-y-0"
                          aria-label={`Subir ${child.code}`}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={index === order.length - 1}
                          onClick={() => moveActive(child.cell_id, 1)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-transform hover:bg-gray-100 hover:text-ezi-gray active:translate-y-0.5 disabled:opacity-30 disabled:active:translate-y-0"
                          aria-label={`Bajar ${child.code}`}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onEdit(child)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-gray-100 hover:text-ezi-gray"
                          aria-label={`Editar ${child.code}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeactivate(child)}
                          className={cn(buttonVariants({ variant: "ghost-ezi", size: "icon-sm" }))}
                          aria-label={`Desactivar ${child.code}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ) : canUpdate && !child.is_active ? (
                      <button
                        type="button"
                        onClick={() => onRestore(child)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-gray-100 hover:text-ezi-gray"
                        aria-label={`Reactivar ${child.code}`}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {dirty || saveError ? (
            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <div className="min-h-[18px] text-xs">
                {saveError ? (
                  <span className="text-destructive" role="alert">
                    {saveError}
                  </span>
                ) : (
                  <span className="text-warning">Orden sin guardar</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={discardOrder}
                  disabled={saveBusy}
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  Descartar
                </button>
                <Button size="sm" onClick={() => void onSaveOrder()} disabled={saveBusy}>
                  {saveBusy ? "Guardando…" : "Guardar orden"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <CellComposition cellId={cell.cell_id} />
    </div>
  );
}
