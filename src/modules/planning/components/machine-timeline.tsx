"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SequencingCell, CellProgram } from "@/modules/planning/db";
import {
  dateLabel,
  entryMinutes,
  formatMinutes,
  PROGRAM_STATUS_META,
} from "@/modules/planning/format";

const PX_PER_MIN = 1.6; // horizontal scale: 8 h ≈ 768 px

export interface MachineTimelineProps {
  cells: SequencingCell[];
  date: string;
  programForCell: (cellId: number) => CellProgram | undefined;
  selectedCellId: number | null;
  dropTargetCellId: number | null;
  onSelectCell: (cellId: number) => void;
  onPrevDay: () => void;
  onNextDay: () => void;
  onDateChange: (date: string) => void;
  loading: boolean;
}

export function MachineTimeline({
  cells,
  date,
  programForCell,
  selectedCellId,
  dropTargetCellId,
  onSelectCell,
  onPrevDay,
  onNextDay,
  onDateChange,
  loading,
}: MachineTimelineProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-semibold text-ezi-gray">Secuencia por máquina</h2>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label="Día anterior" onClick={onPrevDay}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="rounded-md border bg-background px-2 py-1 text-xs"
            aria-label="Fecha del programa"
          />
          <span className="hidden text-xs text-muted-foreground sm:inline">{dateLabel(date)}</span>
          <Button type="button" variant="ghost" size="icon" aria-label="Día siguiente" onClick={onNextDay}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {cells.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          No hay celdas láser enlazadas todavía. Enlázalas en Admin → Migraciones.
        </div>
      ) : (
        <div className={cn("flex-1 overflow-auto", loading && "opacity-60")}>
          <div className="min-w-fit">
            {cells.map((cell) => {
              const program = programForCell(cell.cell_id);
              const entries = program?.entries ?? [];
              const availMin = cell.available_hours != null ? cell.available_hours * 60 : null;
              const selected = selectedCellId === cell.cell_id;
              const isDropTarget = dropTargetCellId === cell.cell_id;
              return (
                <div
                  key={cell.cell_id}
                  data-cell-id={cell.cell_id}
                  onClick={() => onSelectCell(cell.cell_id)}
                  className={cn(
                    "flex cursor-pointer items-stretch border-b transition-colors",
                    selected && "bg-ezi-orange/5",
                    isDropTarget && "bg-ezi-orange/15 ring-1 ring-inset ring-ezi-orange",
                  )}
                >
                  {/* Row header */}
                  <div className="flex w-44 shrink-0 flex-col justify-center gap-0.5 border-r px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate font-mono text-xs font-semibold text-ezi-gray">
                        {cell.cell_code}
                      </span>
                    </div>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {cell.station_description ?? cell.cell_name}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-medium text-ezi-gray">
                        {formatMinutes(program?.total_minutes ?? 0)}
                      </span>
                      {program && (
                        <Badge variant={PROGRAM_STATUS_META[program.status]?.variant ?? "muted"}>
                          {PROGRAM_STATUS_META[program.status]?.label ?? program.status}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Timeline track */}
                  <div className="relative flex-1 py-3">
                    <div className="relative flex h-10 items-stretch gap-0.5 pl-1">
                      {availMin != null && (
                        <div
                          className="pointer-events-none absolute inset-y-0 z-10 border-l-2 border-dashed border-ezi-gray/40"
                          style={{ left: `${availMin * PX_PER_MIN}px` }}
                          title={`Horas disponibles: ${cell.available_hours} h (referencia)`}
                        />
                      )}
                      {entries.length === 0 ? (
                        <span className="flex items-center pl-2 text-xs text-muted-foreground">
                          {isDropTarget ? "Soltar aquí" : "Sin nesteos"}
                        </span>
                      ) : (
                        entries.map((e) => {
                          const mins = entryMinutes(e.cut_minutes);
                          return (
                            <div
                              key={e.eps_nesting_id}
                              className="flex min-w-[2px] flex-col justify-center overflow-hidden rounded bg-ezi-orange/80 px-1.5 text-white"
                              style={{ width: `${Math.max(mins * PX_PER_MIN, 28)}px` }}
                              title={`${e.program_name ?? e.eps_nesting_id} · ${formatMinutes(mins)}`}
                            >
                              <span className="truncate font-mono text-[11px] leading-tight">
                                {e.program_name ?? `#${e.eps_nesting_id}`}
                              </span>
                              <span className="truncate text-[10px] leading-tight opacity-90">
                                {formatMinutes(mins)}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
