"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Boxes,
  Factory,
  GripVertical,
  LayoutGrid,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Ruler,
  Trash2,
  Workflow,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
import { EntityCard, EntityCardGrid } from "@/components/kit/entity-card";
import {
  useExpandingModal,
  type ExpandingModalRect,
} from "@/components/kit/expanding-modal";
import { useCan } from "@/components/providers/permissions-provider";
import { cn } from "@/lib/utils";
import { ApiError, apiMutate } from "@/lib/api-client";
import type { LocationCardOption } from "@/modules/production/components/operative-cells-page";

/** Cell list row as the operative-cells RSC page maps it (production.cell +
 * derived plant + parent/children/process merges from `listCells`). */
export interface OperativeCellRow {
  cell_id: number;
  code: string;
  name: string;
  location_id: number;
  location_name: string;
  plant_id: number;
  plant_name: string;
  parent_cell_id: number | null;
  sequence_in_parent: number | null;
  size_x_m: number | null;
  size_y_m: number | null;
  process_id: number | null;
  process_name: string | null;
  child_count: number;
  current_asset_count: number;
  is_active: boolean;
}

export interface ProcessOption {
  process_id: number;
  name: string;
}

interface AssignmentItem {
  assignment_id: number;
  asset_id: number;
  asset_code: string;
  asset_name: string;
  asset_model: string | null;
  asset_serial_number: string | null;
  asset_has_image: boolean;
  role_label: string | null;
  valid_from: string;
  valid_to: string | null;
}

type FormTarget =
  | { mode: "create"; parent: OperativeCellRow | null }
  | { mode: "edit"; cell: OperativeCellRow };

/** Percentage position (relative to the scrollable content area) used as the
 * `transform-origin` for the "grow open" transition into a cell's detail. */
interface ExpandOrigin {
  x: number;
  y: number;
}

/**
 * Animates its children in as if expanding open from `origin` (the clicked
 * card's position) — scale+fade anchored at that point, so opening a cell
 * reads as a continuation of the click rather than a hard cut. Retriggers
 * whenever `originKey` changes (i.e. drilling into a different cell).
 */
function ExpandTransition({
  originKey,
  origin,
  children,
}: {
  originKey: string | number;
  origin: ExpandOrigin | null;
  children: React.ReactNode;
}) {
  const [phase, setPhase] = React.useState<"opening" | "open">("opening");

  React.useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restarting the open transition for a new target is the effect's purpose, not a derived-state mirror.
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
        transformOrigin: origin ? `${origin.x}% ${origin.y}%` : "50% 0%",
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

function formatSize(cell: OperativeCellRow): string | null {
  if (cell.size_x_m === null || cell.size_y_m === null) return null;
  return `${Number(cell.size_x_m)} × ${Number(cell.size_y_m)} m`;
}

/** Moves `fromId` to sit where `toId` currently is (splice-out, splice-in).
 * Same house pattern as the nav access tree's drag reorder
 * (`permission-manager.tsx`) — no DnD library needed for a flat list. */
function reorder<T>(arr: T[], fromId: T, toId: T): T[] {
  const from = arr.indexOf(fromId);
  const to = arr.indexOf(toId);
  if (from === -1 || to === -1 || from === to) return arr;
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

/**
 * Content of the expanded location card: the location's operative cells as a
 * card grid, with an in-place drill-in per cell (children/operations +
 * read-only composition). Creation is pre-filtered by the location — the form
 * only asks name/size/process; the code is auto-generated server-side
 * (`{plant}-{location}-{NN}`). Assignments are managed from Mantenimiento →
 * Equipos (decision of the operative-cells plan), so composition here is
 * read-only.
 */
export function LocationCellsModal({
  location,
  plantName,
  cells,
  processes,
}: {
  location: LocationCardOption;
  plantName: string;
  cells: OperativeCellRow[];
  processes: ProcessOption[];
}) {
  const can = useCan();
  const router = useRouter();
  const { requestClose } = useExpandingModal();
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [detailId, setDetailId] = React.useState<number | null>(null);
  const [detailOrigin, setDetailOrigin] = React.useState<ExpandOrigin | null>(null);
  const [form, setForm] = React.useState<FormTarget | null>(null);
  const [confirmTarget, setConfirmTarget] =
    React.useState<OperativeCellRow | null>(null);
  const [confirmBusy, setConfirmBusy] = React.useState(false);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);

  const detailCell = cells.find((c) => c.cell_id === detailId) ?? null;
  // If a refresh removed the drilled cell (e.g. another session), fall back.
  const view: "list" | "detail" = detailCell ? "detail" : "list";

  /** Opens a cell card into the detail view, anchoring the "grow open"
   * transition's transform-origin at the clicked card's position within the
   * scrollable content area (percentage-based, so it stays correct across
   * scroll offsets and container resizes). */
  function openCell(cell: OperativeCellRow, cardRect: { top: number; left: number; width: number; height: number } | null) {
    const containerRect = contentRef.current?.getBoundingClientRect();
    if (cardRect && containerRect && containerRect.width > 0 && containerRect.height > 0) {
      setDetailOrigin({
        x: ((cardRect.left + cardRect.width / 2 - containerRect.left) / containerRect.width) * 100,
        y: ((cardRect.top - containerRect.top) / containerRect.height) * 100,
      });
    } else {
      setDetailOrigin(null);
    }
    setDetailId(cell.cell_id);
  }

  const topLevel = cells
    .filter((c) => c.parent_cell_id === null)
    .sort((a, b) => a.code.localeCompare(b.code));

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
    router.refresh();
  }

  /** Reversible, so it runs on direct click without a confirm dialog. */
  async function restore(cellId: number) {
    await fetch(`/api/production/cells/${cellId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    }).catch(() => undefined);
    router.refresh();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header — location identity + back/close. */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b px-6 py-4">
        {view === "detail" ? (
          <button
            type="button"
            onClick={() => setDetailId(null)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground hover:bg-gray-100"
            aria-label="Volver a la ubicación"
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
            {view === "detail" && detailCell ? detailCell.name : location.name}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {view === "detail" && detailCell ? (
              <>
                <span className="font-mono">{detailCell.code}</span>
                {" · "}
                {plantName}
                {" · "}
                {location.name}
              </>
            ) : (
              <>
                <span className="font-mono">{location.code}</span>
                {" · "}
                {plantName}
              </>
            )}
          </p>
        </div>
        {view === "list" && can("production.cell:create") ? (
          <Button size="sm" onClick={() => setForm({ mode: "create", parent: null })}>
            <Plus className="h-4 w-4" />
            Nueva celda
          </Button>
        ) : null}
        <button
          type="button"
          onClick={requestClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground hover:bg-gray-100"
          aria-label="Cerrar"
        >
          <span aria-hidden className="text-lg leading-none">×</span>
        </button>
      </div>

      <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {view === "list" ? (
          <CellCardsList cells={topLevel} onOpen={openCell} />
        ) : detailCell ? (
          <ExpandTransition originKey={detailCell.cell_id} origin={detailOrigin}>
            <CellDetailView
              cell={detailCell}
              childrenCells={cells
                .filter((c) => c.parent_cell_id === detailCell.cell_id)
                .sort(
                  (a, b) =>
                    (a.sequence_in_parent ?? Number.MAX_SAFE_INTEGER) -
                    (b.sequence_in_parent ?? Number.MAX_SAFE_INTEGER),
                )}
              canCreate={can("production.cell:create")}
              canUpdate={can("production.cell:update")}
              onAddChild={() =>
                setForm({ mode: "create", parent: detailCell })
              }
              onEdit={(c) => setForm({ mode: "edit", cell: c })}
              onDeactivate={(c) => {
                setConfirmError(null);
                setConfirmTarget(c);
              }}
              onRestore={(c) => void restore(c.cell_id)}
              onOpenChild={(c) => openCell(c, null)}
              onMutated={() => router.refresh()}
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
          router.refresh();
        }}
      />

      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmTarget(null);
            setConfirmError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar la celda?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget
                ? `${confirmTarget.code} — ${confirmTarget.name} se marcará como inactiva. Podrás reactivarla después.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmError ? (
            <p className="text-sm text-destructive" role="alert">
              {confirmError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-ezi-orange"
              disabled={confirmBusy}
              onClick={(e) => {
                e.preventDefault();
                void deactivate();
              }}
            >
              {confirmBusy ? "Procesando…" : "Desactivar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root view — the location's top-level cells as cards
// ---------------------------------------------------------------------------

function CellCardsList({
  cells,
  onOpen,
}: {
  cells: OperativeCellRow[];
  onOpen: (cell: OperativeCellRow, rect: ExpandingModalRect) => void;
}) {
  if (cells.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 py-16 text-center text-muted-foreground">
        <LayoutGrid className="h-10 w-10 text-gray-300" />
        <p className="mt-2 text-sm font-semibold text-ezi-gray">
          Sin celdas operativas en esta ubicación
        </p>
        <p className="text-xs">
          Crea la primera celda con el botón “Nueva celda”.
        </p>
      </div>
    );
  }
  return (
    <EntityCardGrid className="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
      {cells.map((c) => {
        const size = formatSize(c);
        return (
          <EntityCard
            key={c.cell_id}
            code={c.code}
            title={c.name}
            inactive={!c.is_active}
            badges={[
              ...(c.child_count > 0
                ? [
                    {
                      label: `Línea · ${c.child_count} ${
                        c.child_count === 1 ? "operación" : "operaciones"
                      }`,
                      className: "border-ezi-orange/40 text-ezi-orange",
                    },
                  ]
                : []),
              ...(c.process_name ? [{ label: c.process_name }] : []),
              ...(!c.is_active ? [{ label: "Inactiva" }] : []),
            ]}
            details={[
              { label: "Tamaño", value: size },
              {
                label: "Equipos",
                value:
                  c.current_asset_count > 0 ? c.current_asset_count : null,
              },
            ]}
            onExpand={(rect) => onOpen(c, rect)}
          />
        );
      })}
    </EntityCardGrid>
  );
}

// ---------------------------------------------------------------------------
// Cell drill-in — summary + children (operations) + read-only composition
// ---------------------------------------------------------------------------

function CellDetailView({
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
  // this; nothing hits the network until "Guardar orden". Reset whenever the
  // underlying id SET changes (switched cell, or a child was added/removed);
  // an in-progress drag/arrow edit on the same set survives re-renders (e.g.
  // the RSC refresh a sibling edit triggers) so it isn't lost mid-edit.
  const [order, setOrder] = React.useState<number[]>(savedIds);
  const [committedIds, setCommittedIds] = React.useState<number[]>(savedIds);
  const idsKey = `${cell.cell_id}:${[...savedIds].sort((a, b) => a - b).join(",")}`;
  const [prevIdsKey, setPrevIdsKey] = React.useState(idsKey);
  if (prevIdsKey !== idsKey) {
    setPrevIdsKey(idsKey);
    setOrder(savedIds);
    setCommittedIds(savedIds);
  }
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
      await apiMutate(
        `/api/production/cells/${cell.cell_id}/children/reorder`,
        {
          body: { ordered_cell_ids: order },
          fallback: "No se pudo guardar el orden.",
        },
      );
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
                  className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground hover:bg-orange-50 hover:text-ezi-orange"
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
          drag-order editor (`permission-manager.tsx`). */}
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
                          className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-orange-50 hover:text-ezi-orange"
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

      <CellComposition key={cell.cell_id} cellId={cell.cell_id} />
    </div>
  );
}

function cnRow(active: boolean): string {
  return active
    ? "flex items-center gap-3 py-2.5"
    : "flex items-center gap-3 py-2.5 opacity-60";
}

/** Read-only current composition + closed history. Assignments are managed
 * from Mantenimiento → Equipos; this view only reflects them. */
function CellComposition({ cellId }: { cellId: number }) {
  const [data, setData] = React.useState<{
    current: AssignmentItem[];
    history: AssignmentItem[];
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/production/cells/${cellId}/assignments`)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const d = (await res.json()) as {
          current: AssignmentItem[];
          history: AssignmentItem[];
        };
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo cargar la composición.");
      });
    return () => {
      cancelled = true;
    };
  }, [cellId]);

  return (
    <>
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Composición vigente
          </p>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Boxes className="h-3.5 w-3.5" />
            Se gestiona desde Mantenimiento → Equipos
          </span>
        </div>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : data === null ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : data.current.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin equipos asignados a esta celda.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.current.map((a) => (
              <li
                key={a.assignment_id}
                className="flex gap-3 rounded-lg border bg-gray-50/60 p-3"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-white">
                  {a.asset_has_image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- SAS-redirect URL, not optimizable
                    <img
                      src={`/api/maintenance/assets/${a.asset_id}/image`}
                      alt={`Imagen de ${a.asset_name}`}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/maintenance/machines?asset=${encodeURIComponent(a.asset_code)}`}
                      className="truncate font-mono text-xs font-semibold text-ezi-gray underline-offset-2 hover:text-ezi-orange hover:underline"
                    >
                      {a.asset_code}
                    </Link>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      desde {a.valid_from.slice(0, 10)}
                    </span>
                  </div>
                  <p className="truncate text-sm font-medium text-ezi-gray">
                    {a.asset_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.asset_model ?? "—"}
                    {a.asset_serial_number ? ` · S/N ${a.asset_serial_number}` : ""}
                  </p>
                  {a.role_label ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {a.role_label}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data !== null && data.history.length > 0 ? (
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Historial (asignaciones cerradas)
          </p>
          <ul className="divide-y">
            {data.history.map((a) => (
              <li
                key={a.assignment_id}
                className="flex items-center gap-3 py-2 text-muted-foreground"
              >
                <span className="shrink-0 font-mono text-sm">{a.asset_code}</span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {a.asset_name}
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
    </>
  );
}

// ---------------------------------------------------------------------------
// Create / edit form — location implicit, code auto-generated server-side
// ---------------------------------------------------------------------------

/** Remounted via `key` per target, so `useState` initializers re-seed without
 * effects (house pattern — see MachineFormDialog / AssignDialog). */
function CellFormDialog(props: {
  target: FormTarget | null;
  location: LocationCardOption;
  plantName: string;
  processes: ProcessOption[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const key =
    props.target === null
      ? "closed"
      : props.target.mode === "edit"
        ? `edit-${props.target.cell.cell_id}`
        : `create-${props.target.parent?.cell_id ?? "root"}`;
  return <CellFormDialogInner key={key} {...props} />;
}

function CellFormDialogInner({
  target,
  location,
  processes,
  onOpenChange,
  onSaved,
}: {
  target: FormTarget | null;
  location: LocationCardOption;
  plantName: string;
  processes: ProcessOption[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const editing = target?.mode === "edit" ? target.cell : null;
  const parent = target?.mode === "create" ? target.parent : null;
  const [name, setName] = React.useState(editing?.name ?? "");
  const [sizeX, setSizeX] = React.useState(
    editing?.size_x_m != null ? String(Number(editing.size_x_m)) : "",
  );
  const [sizeY, setSizeY] = React.useState(
    editing?.size_y_m != null ? String(Number(editing.size_y_m)) : "",
  );
  const [processId, setProcessId] = React.useState(
    editing?.process_id != null ? String(editing.process_id) : "",
  );
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const title = editing
    ? `Editar ${editing.code}`
    : parent
      ? `Nueva operación en ${parent.name}`
      : "Nueva celda operativa";

  async function onSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    const x = Number(sizeX);
    const y = Number(sizeY);
    if (!editing && (!sizeX || !sizeY || !(x > 0) || !(y > 0))) {
      setError("El tamaño X y Y (en metros) es obligatorio y mayor a cero.");
      return;
    }
    if ((sizeX && !(x > 0)) || (sizeY && !(y > 0))) {
      setError("El tamaño debe ser mayor a cero.");
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await apiMutate(`/api/production/cells/${editing.cell_id}`, {
          method: "PATCH",
          body: {
            name: name.trim(),
            size_x_m: sizeX ? x : null,
            size_y_m: sizeY ? y : null,
            process_id: processId ? Number(processId) : null,
          },
          fallback: "No se pudo guardar la celda.",
        });
      } else {
        await apiMutate(`/api/production/cells`, {
          method: "POST",
          body: {
            name: name.trim(),
            location_id: location.location_id,
            parent_cell_id: parent?.cell_id ?? null,
            size_x_m: x,
            size_y_m: y,
            process_id: processId ? Number(processId) : null,
          },
          fallback: "No se pudo guardar la celda.",
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <EntityFormDialog
      open={target !== null}
      onOpenChange={onOpenChange}
      title={title}
      busy={busy}
      error={error}
      onSubmit={onSubmit}
      onCancel={() => onOpenChange(false)}
      submitLabel={editing ? "Guardar" : "Crear"}
      sizeClassName="sm:max-w-lg"
    >
      <div className="space-y-4">
        {!editing ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed bg-gray-50 px-3 py-2 text-xs text-muted-foreground">
            <Factory className="h-3.5 w-3.5 shrink-0" />
            <span>
              Ubicación <strong>{location.name}</strong>
              {parent ? (
                <>
                  {" "}
                  · operación de <strong>{parent.name}</strong>
                </>
              ) : null}
              . El código se genera automáticamente.
            </span>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="cell-name">Nombre *</Label>
          <Input
            id="cell-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={160}
            disabled={busy}
            placeholder="p. ej. Celda de corte láser"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cell-size-x">Tamaño X (m) {editing ? "" : "*"}</Label>
            <Input
              id="cell-size-x"
              type="number"
              min={0}
              step="0.1"
              value={sizeX}
              onChange={(e) => setSizeX(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cell-size-y">Tamaño Y (m) {editing ? "" : "*"}</Label>
            <Input
              id="cell-size-y"
              type="number"
              min={0}
              step="0.1"
              value={sizeY}
              onChange={(e) => setSizeY(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cell-process">Proceso</Label>
          <Select
            id="cell-process"
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
          <p className="text-xs text-muted-foreground">
            Con proceso, solo se podrán asignar equipos cuyo tipo lo soporte.
          </p>
        </div>
      </div>
    </EntityFormDialog>
  );
}
