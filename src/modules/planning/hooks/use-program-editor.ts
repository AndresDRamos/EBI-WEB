"use client";

import * as React from "react";
import { apiMutate, ApiError } from "@/lib/api-client";
import type { CellProgram } from "@/modules/planning/db";

/** `YYYY-MM-DD` for a Date, in the browser's local calendar day. */
export function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateInput(d);
}

interface EditorState {
  date: string;
  programs: CellProgram[];
  loading: boolean;
  error: string | null;
  busy: boolean;
}

/**
 * Owns the sequence-editor state for the visible date: the per-cell programs
 * plus every mutation (ensure-draft, add/remove/reorder entry, publish, notes,
 * delete). Each mutation returns the fresh program from the API and patches
 * local state in place, so the timeline and detail panel stay consistent
 * without a full reload.
 */
export function useProgramEditor(initialDate: string) {
  const [state, setState] = React.useState<EditorState>({
    date: initialDate,
    programs: [],
    loading: true,
    error: null,
    busy: false,
  });

  const loadDate = React.useCallback(async (date: string) => {
    setState((s) => ({ ...s, date, loading: true, error: null }));
    try {
      const data = await apiMutate<{ programs: CellProgram[] }>(
        `/api/planning/programs?date=${date}`,
        { method: "GET" },
      );
      setState((s) =>
        s.date === date ? { ...s, programs: data.programs, loading: false } : s,
      );
    } catch (err) {
      setState((s) =>
        s.date === date
          ? { ...s, loading: false, error: err instanceof Error ? err.message : "Error" }
          : s,
      );
    }
  }, []);

  React.useEffect(() => {
    void loadDate(initialDate);
  }, [initialDate, loadDate]);

  // Replace (or insert) a program in local state after a mutation.
  const upsertProgram = React.useCallback((program: CellProgram) => {
    setState((s) => {
      const rest = s.programs.filter(
        (p) => p.machine_program_id !== program.machine_program_id && p.cell_id !== program.cell_id,
      );
      return { ...s, programs: [...rest, program] };
    });
  }, []);

  const dropProgram = React.useCallback((programId: number) => {
    setState((s) => ({
      ...s,
      programs: s.programs.filter((p) => p.machine_program_id !== programId),
    }));
  }, []);

  const run = React.useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      setState((s) => ({ ...s, busy: true, error: null }));
      try {
        return await fn();
      } catch (err) {
        setState((s) => ({
          ...s,
          error: err instanceof ApiError || err instanceof Error ? err.message : "Error",
        }));
        return null;
      } finally {
        setState((s) => ({ ...s, busy: false }));
      }
    },
    [],
  );

  const programForCell = React.useCallback(
    (cellId: number) => state.programs.find((p) => p.cell_id === cellId),
    [state.programs],
  );

  /** Drop a nesting onto a cell: ensure the cell has a draft for the date, then
   * append the nesting. Returns the updated program. */
  const addNestingToCell = React.useCallback(
    (cellId: number, nestingId: number) =>
      run(async () => {
        const existing = state.programs.find(
          (p) => p.cell_id === cellId && p.status === "draft",
        );
        let programId = existing?.machine_program_id;
        if (!programId) {
          const res = await apiMutate<{ program: CellProgram }>("/api/planning/programs", {
            body: { cell_id: cellId, program_date: state.date },
          });
          programId = res.program.machine_program_id;
        }
        const res = await apiMutate<{ program: CellProgram }>(
          `/api/planning/programs/${programId}/entries`,
          { body: { nesting_id: nestingId } },
        );
        upsertProgram(res.program);
        return res.program;
      }),
    [run, state.programs, state.date, upsertProgram],
  );

  const removeNesting = React.useCallback(
    (programId: number, nestingId: number) =>
      run(async () => {
        const res = await apiMutate<{ program: CellProgram }>(
          `/api/planning/programs/${programId}/entries/${nestingId}`,
          { method: "DELETE" },
        );
        upsertProgram(res.program);
        return res.program;
      }),
    [run, upsertProgram],
  );

  const reorder = React.useCallback(
    (programId: number, orderedNestingIds: number[]) =>
      run(async () => {
        const res = await apiMutate<{ program: CellProgram }>(
          `/api/planning/programs/${programId}/entries/reorder`,
          { body: { ordered_nesting_ids: orderedNestingIds } },
        );
        upsertProgram(res.program);
        return res.program;
      }),
    [run, upsertProgram],
  );

  const publish = React.useCallback(
    (programId: number) =>
      run(async () => {
        const res = await apiMutate<{ program: CellProgram }>(
          `/api/planning/programs/${programId}`,
          { method: "PATCH", body: { status: "published" } },
        );
        upsertProgram(res.program);
        return res.program;
      }),
    [run, upsertProgram],
  );

  const saveNotes = React.useCallback(
    (programId: number, notes: string | null) =>
      run(async () => {
        const res = await apiMutate<{ program: CellProgram }>(
          `/api/planning/programs/${programId}`,
          { method: "PATCH", body: { notes } },
        );
        upsertProgram(res.program);
        return res.program;
      }),
    [run, upsertProgram],
  );

  const deleteDraft = React.useCallback(
    (programId: number) =>
      run(async () => {
        await apiMutate(`/api/planning/programs/${programId}`, { method: "DELETE" });
        dropProgram(programId);
        return true;
      }),
    [run, dropProgram],
  );

  return {
    date: state.date,
    programs: state.programs,
    loading: state.loading,
    error: state.error,
    busy: state.busy,
    setDate: loadDate,
    reload: () => loadDate(state.date),
    programForCell,
    addNestingToCell,
    removeNesting,
    reorder,
    publish,
    saveNotes,
    deleteDraft,
  };
}
