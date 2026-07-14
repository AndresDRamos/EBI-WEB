"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, LayoutGrid, MapPin, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useCan } from "@/components/providers/permissions-provider";
import {
  ExpandingModal,
  type ExpandingModalRect,
} from "@/components/kit/expanding-modal";
import {
  CellDetailModal,
  formatSize,
  type OperativeCellRow,
  type ProcessOption,
} from "@/modules/production/components/cell-detail-modal";
import { CellFormDialog } from "@/modules/production/components/cell-form-dialog";

export interface PlantTabOption {
  plant_id: number;
  code: string;
  name: string;
}

export interface LocationCardOption {
  location_id: number;
  plant_id: number;
  code: string;
  name: string;
}

/**
 * Celdas operativas — one page replaces the old Celdas/Líneas tables. Plant
 * tabs act as the filter; each tab shows the plant's locations as board
 * columns (admin-managed in Administración → Plantas), with that location's
 * operative cells stacked as compact cards underneath. Clicking a cell card
 * opens its detail (children/operations + composition) as an expanding modal;
 * creating a cell is pre-filtered to a column's location (auto code, no
 * plant/location inputs). Tabs are local state, not routes: the whole catalog
 * loads in one RSC pass (same approach as the machines cards page).
 */
export function OperativeCellsPage({
  plants,
  locations,
  cells,
  processes,
}: {
  plants: PlantTabOption[];
  locations: LocationCardOption[];
  cells: OperativeCellRow[];
  processes: ProcessOption[];
}) {
  const can = useCan();
  const router = useRouter();
  const [activePlantId, setActivePlantId] = React.useState<number | null>(
    plants[0]?.plant_id ?? null,
  );
  const [cellModal, setCellModal] = React.useState<{
    location: LocationCardOption;
    cellId: number;
    rect: ExpandingModalRect | null;
  } | null>(null);
  const [createFor, setCreateFor] = React.useState<LocationCardOption | null>(
    null,
  );
  const [expandedInactive, setExpandedInactive] = React.useState<
    Set<number>
  >(new Set());

  function toggleInactive(locationId: number) {
    setExpandedInactive((prev) => {
      const next = new Set(prev);
      if (next.has(locationId)) {
        next.delete(locationId);
      } else {
        next.add(locationId);
      }
      return next;
    });
  }

  const plantLocations = locations.filter(
    (l) => l.plant_id === activePlantId,
  );

  /** Active top-level cells per location (children roll up into their parent). */
  function locationStats(locationId: number) {
    const own = cells.filter(
      (c) => c.location_id === locationId && c.is_active,
    );
    return {
      cellCount: own.filter((c) => c.parent_cell_id === null).length,
      assetCount: own.reduce((n, c) => n + c.current_asset_count, 0),
    };
  }

  const activeCellCount = cells.filter(
    (c) =>
      c.is_active &&
      c.parent_cell_id === null &&
      plantLocations.some((l) => l.location_id === c.location_id),
  ).length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-4 pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-ezi-gray">
          Listado de celdas
        </h1>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <LayoutGrid className="h-4 w-4" />
          <span>
            <strong className="font-bold text-ezi-gray">{activeCellCount}</strong>{" "}
            celdas en esta planta
          </span>
        </span>
      </div>

      {/* Plant tabs — same visual language as the kit `PageTabs`, but state
          driven: the tab set is data (org.plant), not routes. The scrollbar
          is hidden (kept functional) so a wide tab set doesn't add visible
          height to the bar. */}
      <nav
        className="flex flex-shrink-0 items-end gap-1 overflow-x-auto border-b [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Plantas"
      >
        {plants.map((p) => {
          const active = p.plant_id === activePlantId;
          return (
            <button
              key={p.plant_id}
              type="button"
              onClick={() => setActivePlantId(p.plant_id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm transition-colors",
                active
                  ? "border-ezi-orange font-semibold text-ezi-gray"
                  : "border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground",
              )}
            >
              {p.name}
            </button>
          );
        })}
      </nav>

      {plantLocations.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center text-muted-foreground">
          <MapPin className="h-10 w-10 text-gray-300" />
          <p className="mt-2 text-sm font-semibold text-ezi-gray">
            Sin ubicaciones en esta planta
          </p>
          <p className="text-xs">
            Un administrador puede darlas de alta en Administración → Plantas.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto py-4">
          {plantLocations.map((loc) => {
            const stats = locationStats(loc.location_id);
            const locCells = cells
              .filter(
                (c) => c.location_id === loc.location_id && c.parent_cell_id === null,
              )
              .sort((a, b) => a.code.localeCompare(b.code));
            const activeCells = locCells.filter((c) => c.is_active);
            const inactiveCells = locCells.filter((c) => !c.is_active);
            const inactiveOpen = expandedInactive.has(loc.location_id);
            return (
              <div
                key={loc.location_id}
                className="flex min-h-0 w-72 shrink-0 flex-col rounded-lg border bg-gray-50/60"
              >
                <div className="flex-shrink-0 space-y-1.5 border-b bg-white px-3 py-2.5 rounded-t-lg">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ezi-gray">
                        {loc.name}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {loc.code}
                      </p>
                    </div>
                    {can("production.cell:create") ? (
                      <button
                        type="button"
                        onClick={() => setCreateFor(loc)}
                        title="Nueva celda"
                        aria-label={`Nueva celda en ${loc.name}`}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-gray-100 hover:text-ezi-gray"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">
                      {stats.cellCount === 1
                        ? "1 celda"
                        : `${stats.cellCount} celdas`}
                    </Badge>
                    {stats.assetCount > 0 ? (
                      <Badge variant="outline">
                        {stats.assetCount === 1
                          ? "1 equipo"
                          : `${stats.assetCount} equipos`}
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                  {locCells.length === 0 ? (
                    <p className="px-1 py-4 text-center text-xs text-muted-foreground">
                      Sin celdas
                    </p>
                  ) : (
                    <>
                      {activeCells.map((cell) => (
                        <CompactCellCard
                          key={cell.cell_id}
                          cell={cell}
                          sourceHidden={cellModal?.cellId === cell.cell_id}
                          onOpen={(rect) =>
                            setCellModal({ location: loc, cellId: cell.cell_id, rect })
                          }
                        />
                      ))}
                      {inactiveCells.length > 0 ? (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => toggleInactive(loc.location_id)}
                            className="flex w-full items-center gap-1 rounded-sm px-1 py-1 text-[11px] font-medium text-muted-foreground hover:bg-gray-100 hover:text-ezi-gray"
                            aria-expanded={inactiveOpen}
                          >
                            <ChevronRight
                              className={cn(
                                "h-3 w-3 shrink-0 transition-transform",
                                inactiveOpen && "rotate-90",
                              )}
                            />
                            Inactivas ({inactiveCells.length})
                          </button>
                          {inactiveOpen ? (
                            <div className="mt-2 space-y-2">
                              {inactiveCells.map((cell) => (
                                <CompactCellCard
                                  key={cell.cell_id}
                                  cell={cell}
                                  sourceHidden={cellModal?.cellId === cell.cell_id}
                                  onOpen={(rect) =>
                                    setCellModal({
                                      location: loc,
                                      cellId: cell.cell_id,
                                      rect,
                                    })
                                  }
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ExpandingModal
        open={cellModal !== null}
        originRect={cellModal?.rect ?? null}
        title={
          cellModal
            ? (cells.find((c) => c.cell_id === cellModal.cellId)?.name ?? "Celda")
            : "Celda"
        }
        onClosed={() => setCellModal(null)}
      >
        {cellModal ? (
          <CellDetailModal
            key={cellModal.cellId}
            rootCellId={cellModal.cellId}
            location={cellModal.location}
            plantName={
              plants.find((p) => p.plant_id === cellModal.location.plant_id)
                ?.name ?? ""
            }
            cells={cells.filter(
              (c) => c.location_id === cellModal.location.location_id,
            )}
            processes={processes}
            onMutated={() => router.refresh()}
          />
        ) : null}
      </ExpandingModal>

      {createFor ? (
        <CellFormDialog
          target={{ mode: "create", parent: null }}
          location={createFor}
          plantName={
            plants.find((p) => p.plant_id === createFor.plant_id)?.name ?? ""
          }
          processes={processes}
          onOpenChange={(open) => {
            if (!open) setCreateFor(null);
          }}
          onSaved={() => {
            setCreateFor(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board card — compact, stacked under its location column
// ---------------------------------------------------------------------------

function CompactCellCard({
  cell,
  sourceHidden,
  onOpen,
}: {
  cell: OperativeCellRow;
  sourceHidden: boolean;
  onOpen: (rect: ExpandingModalRect) => void;
}) {
  const size = formatSize(cell);
  const hasMeta = cell.child_count > 0 || cell.process_name || size;
  return (
    <button
      type="button"
      onClick={(e) => onOpen(e.currentTarget.getBoundingClientRect())}
      className={cn(
        "block w-full rounded-md border bg-card px-3 py-2 text-left transition-[box-shadow,border-color] hover:border-gray-300 hover:shadow-sm",
        !cell.is_active && "opacity-60",
        sourceHidden && "pointer-events-none opacity-0",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="rounded border bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-muted-foreground">
          {cell.code}
        </span>
        {!cell.is_active ? (
          <span className="text-[10px] text-muted-foreground">Inactiva</span>
        ) : null}
      </div>
      <p className="mt-1 truncate text-sm font-medium leading-tight text-ezi-gray">
        {cell.name}
      </p>
      {hasMeta ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {cell.child_count > 0 ? (
            <Badge
              variant="outline"
              className="border-ezi-orange/40 text-[10px] text-ezi-orange"
            >
              {cell.child_count}{" "}
              {cell.child_count === 1 ? "operación" : "operaciones"}
            </Badge>
          ) : null}
          {cell.process_name ? (
            <Badge variant="outline" className="text-[10px]">
              {cell.process_name}
            </Badge>
          ) : null}
        </div>
      ) : null}
    </button>
  );
}
