"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description: React.ReactNode;
  confirmLabel?: string;
  pendingLabel?: string;
  cancelLabel?: string;
  /** Async work in flight — disables both buttons and swaps the confirm
   * label to `pendingLabel`. */
  busy?: boolean;
  /** Inline error from a failed previous attempt (stays open on failure). */
  error?: string | null;
  /** Red destructive styling instead of the brand-orange default (most
   * confirms in this app — deactivate, reassign, even permanent delete —
   * use the brand tone; reserve this for truly irreversible danger). */
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

/** Shared confirm/destructive-action dialog — replaces the hand-built
 * `<AlertDialog>` block that was copy-pasted across cards/modals (deactivate
 * equipment, deactivate cell, delete nav item, generic entity delete). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  pendingLabel = "Procesando…",
  cancelLabel = "Cancelar",
  busy = false,
  error = null,
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) onOpenChange(o);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className={cn(
              destructive &&
                "bg-destructive text-destructive-foreground hover:bg-orange-800",
            )}
            onClick={(e) => {
              e.preventDefault();
              void onConfirm();
            }}
          >
            {busy ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
