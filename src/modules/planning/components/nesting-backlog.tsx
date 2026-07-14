"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Filter, GripVertical, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { NestingRow, NestingComponentRow, RouteStepRow } from "@/modules/planning/db";
import {
  ageLabel,
  formatMinutes,
  materialStatus,
  MATERIAL_STATUS_META,
  secondsToMinLabel,
  type MaterialStatus,
} from "@/modules/planning/format";

type SortKey = "priority" | "date" | "time";

export interface NestingBacklogProps {
  nestings: NestingRow[];
  componentsByNesting: Map<number, NestingComponentRow[]>;
  routeSteps: Record<number, RouteStepRow[]>;
  placedIds: Set<number>;
  suggestionStationId: number | null;
  onCardPointerDown: (nestingId: number, e: React.PointerEvent) => void;
  draggingId: number | null;
}

export function NestingBacklog({
  nestings,
  componentsByNesting,
  routeSteps,
  placedIds,
  suggestionStationId,
  onCardPointerDown,
  draggingId,
}: NestingBacklogProps) {
  const [sort, setSort] = React.useState<SortKey>("priority");
  const [showFilters, setShowFilters] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<MaterialStatus | "all">("all");
  const [onlySuggested, setOnlySuggested] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());

  const visible = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = nestings.filter((n) => {
      if (placedIds.has(n.eps_nesting_id)) return false;
      if (statusFilter !== "all" && materialStatus(n) !== statusFilter) return false;
      if (onlySuggested && suggestionStationId !== null && n.eps_station_id !== suggestionStationId)
        return false;
      if (q) {
        const comps = componentsByNesting.get(n.eps_nesting_id) ?? [];
        const hay =
          `${n.program_name ?? ""} ${n.plate_material_code ?? ""}`.toLowerCase().includes(q) ||
          comps.some((c) => `${c.part_code ?? ""} ${c.part_name ?? ""}`.toLowerCase().includes(q));
        if (!hay) return false;
      }
      return true;
    });
    rows.sort((a, b) => {
      if (sort === "priority")
        return (a.eps_priority ?? 9999) - (b.eps_priority ?? 9999);
      if (sort === "time") return (b.cut_minutes ?? 0) - (a.cut_minutes ?? 0);
      return new Date(a.eps_created_at).getTime() - new Date(b.eps_created_at).getTime();
    });
    return rows;
  }, [nestings, placedIds, statusFilter, onlySuggested, suggestionStationId, search, sort, componentsByNesting]);

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-semibold text-ezi-gray">
          Pendientes <span className="text-muted-foreground">({visible.length})</span>
        </h2>
        <div className="flex items-center gap-1">
          <select
            aria-label="Ordenar"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border bg-background px-2 py-1 text-xs"
          >
            <option value="priority">Prioridad</option>
            <option value="date">Antigüedad</option>
            <option value="time">Tiempo de corte</option>
          </select>
          <Button
            type="button"
            variant={showFilters ? "secondary" : "ghost"}
            size="icon"
            aria-label="Filtros"
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="space-y-2 border-b bg-muted/30 px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar programa, placa o parte…"
              className="h-8 pl-7 text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {(["all", "pending", "requested", "issued", "in_progress"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs transition-colors",
                  statusFilter === s
                    ? "border-ezi-orange bg-ezi-orange/10 text-ezi-gray"
                    : "border-transparent bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {s === "all" ? "Todos" : MATERIAL_STATUS_META[s].label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={onlySuggested}
              disabled={suggestionStationId === null}
              onChange={(e) => setOnlySuggested(e.target.checked)}
            />
            Solo la estación sugerida de la máquina seleccionada
          </label>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {visible.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No hay nesteos pendientes con estos filtros.
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map((n) => {
              const comps = componentsByNesting.get(n.eps_nesting_id) ?? [];
              const status = MATERIAL_STATUS_META[materialStatus(n)];
              const isOpen = expanded.has(n.eps_nesting_id);
              const isDragging = draggingId === n.eps_nesting_id;
              return (
                <li
                  key={n.eps_nesting_id}
                  className={cn(
                    "rounded-lg border bg-background shadow-sm transition-shadow",
                    isDragging ? "opacity-40" : "hover:shadow-md",
                  )}
                >
                  <div className="flex items-start gap-1.5 p-2">
                    <button
                      type="button"
                      aria-label="Arrastrar a una máquina"
                      onPointerDown={(e) => onCardPointerDown(n.eps_nesting_id, e)}
                      className="mt-0.5 cursor-grab touch-none text-muted-foreground hover:text-ezi-gray active:cursor-grabbing"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs font-semibold text-ezi-gray">
                          {n.program_name ?? `#${n.eps_nesting_id}`}
                        </span>
                        {n.eps_priority !== null && (
                          <Badge variant="outline" className="shrink-0">
                            P{n.eps_priority}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <span className="truncate">{n.plate_material_code ?? "—"}</span>
                        <span aria-hidden>·</span>
                        <span>{n.plate_count ?? 0} pl</span>
                        <span aria-hidden>·</span>
                        <span>{formatMinutes(n.cut_minutes)}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <Badge variant={status.variant}>{status.label}</Badge>
                        <Badge variant="muted">{ageLabel(n.eps_created_at)}</Badge>
                        {n.station_description && (
                          <Badge variant="outline" title="Estación sugerida por EPS">
                            {n.station_description}
                          </Badge>
                        )}
                        {comps.length > 0 && (
                          <button
                            type="button"
                            onClick={() => toggle(n.eps_nesting_id)}
                            className="ml-auto inline-flex items-center gap-0.5 text-xs text-ezi-orange hover:underline"
                          >
                            {isOpen ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ChevronRight className="h-3 w-3" />
                            )}
                            {comps.length} parte{comps.length === 1 ? "" : "s"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {isOpen && comps.length > 0 && (
                    <ul className="space-y-1.5 border-t bg-muted/20 px-3 py-2">
                      {comps.map((c) => {
                        const steps = routeSteps[c.part_material_id] ?? [];
                        return (
                          <li key={c.line_no} className="text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate font-mono text-ezi-gray">
                                {c.part_code ?? c.part_material_id}
                              </span>
                              <span className="shrink-0 text-muted-foreground">
                                {c.quantity ?? 0} pz
                              </span>
                            </div>
                            {c.part_name && (
                              <p className="truncate text-muted-foreground">{c.part_name}</p>
                            )}
                            {steps.length > 0 && (
                              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                                {steps.map((s, i) => (
                                  <span
                                    key={`${s.fabrication_order}-${i}`}
                                    className="inline-flex items-center gap-1 rounded bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground ring-1 ring-inset ring-border"
                                    title={`${s.process_name ?? s.route_name ?? ""} · ${secondsToMinLabel(s.process_seconds)}`}
                                  >
                                    {s.process_name ?? s.route_name ?? "—"}
                                  </span>
                                ))}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
