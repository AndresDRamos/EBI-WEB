"use client";

import * as React from "react";
import { Factory, LayoutGrid, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EntityCard,
  EntityCardGrid,
} from "@/components/kit/entity-card";
import {
  ExpandingModal,
  type ExpandingModalRect,
} from "@/components/kit/expanding-modal";
import {
  LocationCellsModal,
  type OperativeCellRow,
  type ProcessOption,
} from "@/modules/production/components/location-cells-modal";

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
 * tabs act as the natural filter; each tab shows the plant's locations as
 * cards (admin-managed in Administración → Plantas); a location card expands
 * into a modal with that location's operative cells, where production users
 * create cells pre-filtered by the location (auto code, no plant/location
 * inputs). Tabs are local state, not routes: the whole catalog loads in one
 * RSC pass (same approach as the machines cards page).
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
  const [activePlantId, setActivePlantId] = React.useState<number | null>(
    plants[0]?.plant_id ?? null,
  );
  const [modal, setModal] = React.useState<{
    location: LocationCardOption;
    rect: ExpandingModalRect | null;
  } | null>(null);

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

  const modalLocation = modal?.location ?? null;
  const modalPlantName =
    plants.find((p) => p.plant_id === modalLocation?.plant_id)?.name ?? "";

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-4 pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-ezi-gray">
          Celdas operativas
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
          driven: the tab set is data (org.plant), not routes. */}
      <nav
        className="flex flex-shrink-0 items-end gap-1 overflow-x-auto border-b"
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

      <div className="flex-1 overflow-y-auto py-4">
        {plantLocations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-16 text-center text-muted-foreground">
            <MapPin className="h-10 w-10 text-gray-300" />
            <p className="mt-2 text-sm font-semibold text-ezi-gray">
              Sin ubicaciones en esta planta
            </p>
            <p className="text-xs">
              Un administrador puede darlas de alta en Administración → Plantas.
            </p>
          </div>
        ) : (
          <EntityCardGrid>
            {plantLocations.map((loc) => {
              const stats = locationStats(loc.location_id);
              return (
                <EntityCard
                  key={loc.location_id}
                  code={loc.code}
                  title={loc.name}
                  badges={[
                    {
                      label:
                        stats.cellCount === 1
                          ? "1 celda"
                          : `${stats.cellCount} celdas`,
                    },
                    ...(stats.assetCount > 0
                      ? [
                          {
                            label:
                              stats.assetCount === 1
                                ? "1 equipo"
                                : `${stats.assetCount} equipos`,
                          },
                        ]
                      : []),
                  ]}
                  locations={[
                    {
                      icon: Factory,
                      label:
                        plants.find((p) => p.plant_id === loc.plant_id)?.name ??
                        "",
                    },
                  ]}
                  onExpand={(rect) => setModal({ location: loc, rect })}
                  sourceHidden={modal?.location.location_id === loc.location_id}
                />
              );
            })}
          </EntityCardGrid>
        )}
      </div>

      <ExpandingModal
        open={modal !== null}
        originRect={modal?.rect ?? null}
        title={modalLocation ? modalLocation.name : "Ubicación"}
        onClosed={() => setModal(null)}
      >
        {modalLocation ? (
          <LocationCellsModal
            key={modalLocation.location_id}
            location={modalLocation}
            plantName={modalPlantName}
            cells={cells.filter(
              (c) => c.location_id === modalLocation.location_id,
            )}
            processes={processes}
          />
        ) : null}
      </ExpandingModal>
    </div>
  );
}
