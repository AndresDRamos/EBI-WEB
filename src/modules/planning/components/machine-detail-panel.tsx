"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import type { SequencingCell, CellProgram } from "@/modules/planning/db";
import {
  entryMinutes,
  formatMinutes,
  PROGRAM_STATUS_META,
} from "@/modules/planning/format";

/** Running total of loaded minutes at each position (pure, no render mutation). */
function cumulativeMinutes(entries: { cut_minutes: number | null }[]): number[] {
  let acc = 0;
  return entries.map((e) => (acc += entryMinutes(e.cut_minutes)));
}

export interface MachineDetailPanelProps {
  cell: SequencingCell | null;
  program: CellProgram | undefined;
  canManage: boolean;
  busy: boolean;
  onReorder: (programId: number, orderedNestingIds: number[]) => void;
  onRemove: (programId: number, nestingId: number) => void;
  onPublish: (programId: number) => void;
  onSaveNotes: (programId: number, notes: string | null) => void;
  onDeleteDraft: (programId: number) => void;
}

export function MachineDetailPanel({
  cell,
  program,
  canManage,
  busy,
  onReorder,
  onRemove,
  onPublish,
  onSaveNotes,
  onDeleteDraft,
}: MachineDetailPanelProps) {
  const [confirmPublish, setConfirmPublish] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [notes, setNotes] = React.useState(program?.notes ?? "");
  // Reset the notes draft when the selected program changes — the sanctioned
  // "adjust state during render" pattern (no effect, no cascading render).
  const [notesFor, setNotesFor] = React.useState<number | null>(
    program?.machine_program_id ?? null,
  );
  const currentProgramId = program?.machine_program_id ?? null;
  if (currentProgramId !== notesFor) {
    setNotesFor(currentProgramId);
    setNotes(program?.notes ?? "");
  }

  if (!cell) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Selecciona una máquina para ver y editar su secuencia.
      </div>
    );
  }

  const entries = program?.entries ?? [];
  const isDraft = program?.status === "draft";
  const editable = canManage && isDraft;

  const move = (index: number, delta: number) => {
    if (!program) return;
    const next = entries.map((e) => e.eps_nesting_id);
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onReorder(program.machine_program_id, next);
  };

  // Prefix-sum of loaded minutes (cut + setup) per position, for the "acum."
  // labels — computed in a memo so the render body stays free of mutation.
  const cumulative = cumulativeMinutes(entries);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-sm font-semibold text-ezi-gray">
            {cell.cell_code} · {cell.station_description ?? cell.cell_name}
          </h2>
          {program && (
            <Badge variant={PROGRAM_STATUS_META[program.status]?.variant ?? "muted"}>
              {PROGRAM_STATUS_META[program.status]?.label ?? program.status}
            </Badge>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            <strong className="text-ezi-gray">{formatMinutes(program?.total_minutes ?? 0)}</strong> carga
          </span>
          <span>
            <strong className="text-ezi-gray">{entries.length}</strong> nesteo
            {entries.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {entries.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Arrastra nesteos del panel izquierdo a esta máquina.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {entries.map((e, i) => {
              return (
                <li
                  key={e.eps_nesting_id}
                  className="flex items-center gap-2 rounded-lg border bg-background p-2"
                >
                  <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-mono text-xs font-semibold text-ezi-gray">
                        {e.program_name ?? `#${e.eps_nesting_id}`}
                      </span>
                      {e.eps_sequence_no !== null && (
                        <Badge variant="outline" title="Secuencia actual en EPS">
                          EPS #{e.eps_sequence_no}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{formatMinutes(entryMinutes(e.cut_minutes))}</span>
                      <span aria-hidden>·</span>
                      <span>acum. {formatMinutes(cumulative[i])}</span>
                    </div>
                  </div>
                  {editable && (
                    <div className="flex shrink-0 items-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Subir"
                        disabled={i === 0 || busy}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Bajar"
                        disabled={i === entries.length - 1 || busy}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Quitar"
                        disabled={busy}
                        onClick={() => onRemove(program!.machine_program_id, e.eps_nesting_id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {program && (
        <div className="space-y-2 border-t p-3">
          {editable && (
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() =>
                (notes || null) !== (program.notes ?? null) &&
                onSaveNotes(program.machine_program_id, notes.trim() || null)
              }
              placeholder="Notas del programa…"
              rows={2}
              className="text-xs"
            />
          )}
          {!editable && program.notes && (
            <p className="rounded bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
              {program.notes}
            </p>
          )}
          {canManage && isDraft && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                className="flex-1"
                disabled={busy || entries.length === 0}
                onClick={() => setConfirmPublish(true)}
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                Publicar
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Eliminar borrador"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmPublish}
        onOpenChange={setConfirmPublish}
        title="Publicar programa"
        description="El programa quedará publicado para esta máquina y fecha. Si ya había uno publicado, se archivará."
        confirmLabel="Publicar"
        busy={busy}
        onConfirm={async () => {
          if (program) await onPublish(program.machine_program_id);
          setConfirmPublish(false);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminar borrador"
        description="Se eliminará este borrador y todos sus nesteos. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        busy={busy}
        onConfirm={async () => {
          if (program) await onDeleteDraft(program.machine_program_id);
          setConfirmDelete(false);
        }}
      />
    </div>
  );
}
