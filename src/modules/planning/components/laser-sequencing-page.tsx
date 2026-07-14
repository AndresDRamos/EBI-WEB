"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { useCan } from "@/components/providers/permissions-provider";
import type {
  LaserBacklog,
  NestingComponentRow,
  SequencingCell,
} from "@/modules/planning/db";
import { useProgramEditor, toDateInput } from "@/modules/planning/hooks/use-program-editor";
import { NestingBacklog } from "./nesting-backlog";
import { MachineTimeline } from "./machine-timeline";
import { MachineDetailPanel } from "./machine-detail-panel";

const DRAG_THRESHOLD = 5;

export interface LaserSequencingPageProps {
  backlog: LaserBacklog;
  cells: SequencingCell[];
  today: string;
  staleWarning: string | null;
}

interface DragRef {
  nestingId: number;
  startX: number;
  startY: number;
  active: boolean;
}

export function LaserSequencingPage({
  backlog,
  cells,
  today,
  staleWarning,
}: LaserSequencingPageProps) {
  const can = useCan();
  const canEdit = can("planning.program:create") && can("planning.program:update");
  const canManage = can("planning.program:update");

  const editor = useProgramEditor(today);
  const [selectedCellId, setSelectedCellId] = React.useState<number | null>(null);

  // Pointer-drag state (house pattern: no DnD library).
  const dragRef = React.useRef<DragRef | null>(null);
  const [draggingId, setDraggingId] = React.useState<number | null>(null);
  const [ghost, setGhost] = React.useState<{ x: number; y: number; label: string } | null>(null);
  const [dropTargetCellId, setDropTargetCellId] = React.useState<number | null>(null);

  const componentsByNesting = React.useMemo(() => {
    const map = new Map<number, NestingComponentRow[]>();
    for (const c of backlog.components) {
      const list = map.get(c.eps_nesting_id);
      if (list) list.push(c);
      else map.set(c.eps_nesting_id, [c]);
    }
    return map;
  }, [backlog.components]);

  const placedIds = React.useMemo(() => {
    const set = new Set<number>();
    for (const p of editor.programs) for (const e of p.entries) set.add(e.eps_nesting_id);
    return set;
  }, [editor.programs]);

  const nestingLabel = React.useCallback(
    (id: number) =>
      backlog.nestings.find((n) => n.eps_nesting_id === id)?.program_name ?? `#${id}`,
    [backlog.nestings],
  );

  const cellIdAtPoint = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest("[data-cell-id]");
    const raw = el?.getAttribute("data-cell-id");
    return raw ? Number(raw) : null;
  };

  const onCardPointerDown = React.useCallback(
    (nestingId: number, e: React.PointerEvent) => {
      if (!canEdit) return;
      e.preventDefault();
      dragRef.current = { nestingId, startX: e.clientX, startY: e.clientY, active: false };
    },
    [canEdit],
  );

  React.useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (!drag.active) {
        if (
          Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD &&
          Math.abs(e.clientY - drag.startY) < DRAG_THRESHOLD
        )
          return;
        drag.active = true;
        setDraggingId(drag.nestingId);
      }
      setGhost({ x: e.clientX, y: e.clientY, label: nestingLabel(drag.nestingId) });
      setDropTargetCellId(cellIdAtPoint(e.clientX, e.clientY));
    };
    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag?.active) {
        const cellId = cellIdAtPoint(e.clientX, e.clientY);
        if (cellId !== null) {
          setSelectedCellId(cellId);
          void editor.addNestingToCell(cellId, drag.nestingId);
        }
      }
      setDraggingId(null);
      setGhost(null);
      setDropTargetCellId(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [editor, nestingLabel]);

  const selectedCell = cells.find((c) => c.cell_id === selectedCellId) ?? null;
  const selectedProgram = selectedCellId !== null ? editor.programForCell(selectedCellId) : undefined;
  const suggestionStationId = selectedCell?.eps_station_id ?? null;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-2">
      {(staleWarning || editor.error) && (
        <div className="flex flex-col gap-1">
          {staleWarning && (
            <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-ezi-gray">
              <AlertTriangle className="h-4 w-4 text-warning" />
              {staleWarning}
            </div>
          )}
          {editor.error && (
            <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs text-danger">
              {editor.error}
            </div>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-2">
        <section className="w-80 shrink-0 overflow-hidden rounded-lg border bg-card">
          <NestingBacklog
            nestings={backlog.nestings}
            componentsByNesting={componentsByNesting}
            routeSteps={backlog.routeSteps}
            placedIds={placedIds}
            suggestionStationId={suggestionStationId}
            onCardPointerDown={onCardPointerDown}
            draggingId={draggingId}
          />
        </section>

        <section className="min-w-0 flex-1 overflow-hidden rounded-lg border bg-card">
          <MachineTimeline
            cells={cells}
            date={editor.date}
            programForCell={editor.programForCell}
            selectedCellId={selectedCellId}
            dropTargetCellId={dropTargetCellId}
            onSelectCell={setSelectedCellId}
            onPrevDay={() => editor.setDate(shift(editor.date, -1))}
            onNextDay={() => editor.setDate(shift(editor.date, 1))}
            onDateChange={(d) => editor.setDate(d)}
            loading={editor.loading}
          />
        </section>

        {selectedCellId !== null && (
          <section className="w-80 shrink-0 overflow-hidden rounded-lg border bg-card">
            <MachineDetailPanel
              cell={selectedCell}
              program={selectedProgram}
              canManage={canManage}
              busy={editor.busy}
              onReorder={editor.reorder}
              onRemove={editor.removeNesting}
              onPublish={editor.publish}
              onSaveNotes={editor.saveNotes}
              onDeleteDraft={(id) => {
                void editor.deleteDraft(id);
              }}
            />
          </section>
        )}
      </div>

      {ghost && (
        <div
          className="pointer-events-none fixed z-50 rounded-md border border-ezi-orange bg-background px-2 py-1 font-mono text-xs font-semibold text-ezi-gray shadow-lg"
          style={{ left: ghost.x + 12, top: ghost.y + 12 }}
        >
          {ghost.label}
        </div>
      )}
    </div>
  );
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateInput(d);
}
