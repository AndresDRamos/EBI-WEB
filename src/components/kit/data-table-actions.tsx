"use client";

import * as React from "react";
import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { cn } from "@/lib/utils";

/** Row actions (edit / soft-hard delete / restore) + confirm dialogs. Shared
 * by `DataTable` and `GroupedDataTable` (which import it from here). */
export function ActionsCell<T>({
  row,
  isActive,
  onEdit,
  onSoftDelete,
  onHardDelete,
  onRestore,
  canEdit,
  canDelete,
  onAfterChange,
}: {
  row: T;
  isActive: (row: T) => boolean;
  onEdit?: (row: T) => void;
  onSoftDelete?: (row: T) => Promise<{ error?: string }>;
  onHardDelete?: (row: T) => Promise<{ error?: string }>;
  onRestore?: (row: T) => Promise<{ error?: string }>;
  canEdit?: (row: T) => boolean;
  canDelete?: (row: T) => boolean;
  onAfterChange?: () => void;
}) {
  const active = isActive(row);
  const canEditRow = canEdit ? canEdit(row) : true;
  const canDeleteRow = canDelete ? canDelete(row) : true;
  const editDisabled = !onEdit || !canEditRow;
  // The trash is offered in active mode when soft-delete handler exists, and in
  // inactive mode when hard-delete handler exists.
  const hasDeleteHandler = active ? Boolean(onSoftDelete) : Boolean(onHardDelete);
  const deleteDisabled = !hasDeleteHandler || !canDeleteRow;
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Restore runs on direct click (reversible — no confirm); the dialog below
  // is only used to surface a failure.
  const [restoreBusy, setRestoreBusy] = React.useState(false);
  const [restoreError, setRestoreError] = React.useState<string | null>(null);

  async function doRestore() {
    if (!onRestore) return;
    setRestoreBusy(true);
    let res: { error?: string };
    try {
      res = await onRestore(row);
    } catch {
      res = { error: "No se pudo completar la acción." };
    }
    setRestoreBusy(false);
    if (res && res.error) {
      setRestoreError(res.error);
      return;
    }
    onAfterChange?.();
  }

  async function confirmDelete() {
    setError(null);
    setBusy(true);
    const handler = active ? onSoftDelete : onHardDelete;
    if (!handler) {
      setBusy(false);
      setDialogOpen(false);
      return;
    }
    let res: { error?: string };
    try {
      res = await handler(row);
    } catch {
      res = { error: "No se pudo completar la acción." };
    }
    setBusy(false);
    if (res && res.error) {
      setError(res.error);
      return;
    }
    setDialogOpen(false);
    onAfterChange?.();
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={editDisabled}
              onClick={() => onEdit?.(row)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-gray-100 hover:text-ezi-gray disabled:pointer-events-none disabled:opacity-40"
              aria-label="Editar"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Editar</TooltipContent>
        </Tooltip>
        {!active && onRestore ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={restoreBusy}
                onClick={() => void doRestore()}
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-green-50 hover:text-green-700 disabled:pointer-events-none disabled:opacity-40"
                aria-label="Reactivar"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Reactivar</TooltipContent>
          </Tooltip>
        ) : null}
        {!deleteDisabled ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setDialogOpen(true);
                }}
                className={cn(buttonVariants({ variant: "ghost-ezi", size: "icon-sm" }))}
                aria-label={active ? "Desactivar" : "Eliminar permanentemente"}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {active ? "Desactivar" : "Eliminar permanentemente"}
            </TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex h-7 w-7 cursor-not-allowed items-center justify-center rounded-sm text-muted-foreground opacity-40">
                <Trash2 className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">No se puede eliminar</TooltipContent>
          </Tooltip>
        )}
      </div>

      <AlertDialog
        open={restoreError !== null}
        onOpenChange={(o) => {
          if (!o) setRestoreError(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No se pudo reactivar</AlertDialogTitle>
            <AlertDialogDescription>{restoreError}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cerrar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setError(null);
        }}
        title={
          active ? "¿Desactivar el registro?" : "¿Eliminar permanentemente el registro?"
        }
        description={
          active
            ? "El registro se marcará como inactivo. Podrás reactivarlo o eliminarlo después."
            : "Esta acción no se puede deshacer. Si el registro está referenciado por otros (por usuarios), se bloqueará."
        }
        confirmLabel={active ? "Desactivar" : "Eliminar permanentemente"}
        busy={busy}
        error={error}
        onConfirm={confirmDelete}
      />
    </>
  );
}
