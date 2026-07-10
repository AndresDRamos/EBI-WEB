"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, LayoutGrid, MapPin, Plus } from "lucide-react";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { Button } from "@/components/ui/button";
import { EntityCard, EntityCardGrid } from "@/components/kit/entity-card";
import {
  useExpandingModal,
  type ExpandingModalRect,
} from "@/components/kit/expanding-modal";
import { useCan } from "@/components/providers/permissions-provider";
import { cn } from "@/lib/utils";
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

export function formatSize(cell: OperativeCellRow): string | null {
  if (cell.size_x_m === null || cell.size_y_m === null) return null;
  return `${Number(cell.size_x_m)} × ${Number(cell.size_y_m)} m`;
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
  const detailChildren = detailCell
    ? cells
        .filter((c) => c.parent_cell_id === detailCell.cell_id)
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
  const detailKey = detailCell
    ? `${detailCell.cell_id}:${detailChildren.map((c) => c.cell_id).sort((a, b) => a - b).join(",")}`
    : "none";

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
              key={detailKey}
              cell={detailCell}
              childrenCells={detailChildren}
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
      <EmptyState
        icon={LayoutGrid}
        title="Sin celdas operativas en esta ubicación"
        description={'Crea la primera celda con el botón "Nueva celda".'}
      />
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
