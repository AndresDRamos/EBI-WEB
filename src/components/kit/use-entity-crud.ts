"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { apiMutate } from "@/lib/api-client";

export interface EntityCrudModalState<TExtra = undefined> {
  open: boolean;
  editId: number | null;
  extra: TExtra;
}

export interface UseEntityCrudOptions<TRow> {
  /** e.g. `/api/org/processes` — create is `POST basePath`, update/delete are `{basePath}/{id}`. */
  basePath: string;
  getId: (row: TRow) => number;
  /** Runs after any successful mutation. Defaults to `router.refresh()`. */
  onDone?: () => void;
}

export interface UseEntityCrudResult<TRow, TExtra = undefined> {
  modalState: EntityCrudModalState<TExtra>;
  openCreate: (extra?: TExtra) => void;
  openEdit: (row: TRow, extra?: TExtra) => void;
  closeModal: () => void;
  error: string | null;
  setError: (error: string | null) => void;
  busy: boolean;
  /**
   * POST (create) or PUT `basePath/{editId}` (update) depending on the open
   * modal. Returns whether it succeeded — on failure `error` is already set
   * for an `EntityFormDialog`; the caller only needs to reset its form fields
   * on success.
   */
  submit: (body: unknown, fallback: string) => Promise<boolean>;
  /** For `DataTable`/`GroupedDataTable`'s onSoftDelete(Group|Child) etc. */
  onSoftDelete: (row: TRow, fallback: string) => Promise<{ error?: string }>;
  onHardDelete: (row: TRow, fallback: string) => Promise<{ error?: string }>;
  onRestore: (row: TRow, fallback: string) => Promise<{ error?: string }>;
}

const CLOSED_MODAL = { open: false, editId: null } as const;

/**
 * Extracts the ~120-line CRUD cycle repeated across the catalog pages
 * (`processes-table-page.tsx`, `plants-locations-page.tsx`,
 * `departments-roles-page.tsx`, `machine-catalogs-page.tsx`): modal
 * open/edit/close state, busy/error state, and the create-or-update submit +
 * soft-delete/hard-delete/restore row actions, all wired through `apiMutate`.
 *
 * Form field state stays with the caller (it's resource-specific); pass an
 * `TExtra` payload to `openCreate`/`openEdit` for context a row action needs
 * beyond its own id (e.g. the parent group id when creating a child row).
 *
 * Not a migration to Server Actions — that's a bigger architectural change,
 * left for a future pass.
 */
export function useEntityCrud<TRow, TExtra = undefined>({
  basePath,
  getId,
  onDone,
}: UseEntityCrudOptions<TRow>): UseEntityCrudResult<TRow, TExtra> {
  const router = useRouter();
  const done = React.useCallback(() => (onDone ? onDone() : router.refresh()), [onDone, router]);
  const [modalState, setModalState] = React.useState<EntityCrudModalState<TExtra>>({
    ...CLOSED_MODAL,
    extra: undefined as TExtra,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const openCreate = React.useCallback((extra?: TExtra) => {
    setError(null);
    setModalState({ open: true, editId: null, extra: extra as TExtra });
  }, []);

  const openEdit = React.useCallback(
    (row: TRow, extra?: TExtra) => {
      setError(null);
      setModalState({ open: true, editId: getId(row), extra: extra as TExtra });
    },
    [getId],
  );

  const closeModal = React.useCallback(() => {
    setModalState((prev) => ({ ...prev, ...CLOSED_MODAL }));
    setError(null);
  }, []);

  const submit = React.useCallback(
    async (body: unknown, fallback: string): Promise<boolean> => {
      setError(null);
      setBusy(true);
      try {
        const id = modalState.editId;
        await apiMutate(id ? `${basePath}/${id}` : basePath, {
          method: id ? "PUT" : "POST",
          body,
          fallback,
        });
        closeModal();
        done();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error inesperado.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [basePath, modalState.editId, closeModal, done],
  );

  const rowAction = React.useCallback(
    async (row: TRow, body: unknown, method: string, fallback: string): Promise<{ error?: string }> => {
      try {
        await apiMutate(`${basePath}/${getId(row)}`, { method, body, fallback });
        done();
        return {};
      } catch (err) {
        return { error: err instanceof Error ? err.message : fallback };
      }
    },
    [basePath, getId, done],
  );

  const onSoftDelete = React.useCallback(
    (row: TRow, fallback: string) => rowAction(row, { is_active: false }, "PUT", fallback),
    [rowAction],
  );
  const onHardDelete = React.useCallback(
    (row: TRow, fallback: string) => rowAction(row, undefined, "DELETE", fallback),
    [rowAction],
  );
  const onRestore = React.useCallback(
    (row: TRow, fallback: string) => rowAction(row, { is_active: true }, "PUT", fallback),
    [rowAction],
  );

  return {
    modalState,
    openCreate,
    openEdit,
    closeModal,
    error,
    setError,
    busy,
    submit,
    onSoftDelete,
    onHardDelete,
    onRestore,
  };
}
