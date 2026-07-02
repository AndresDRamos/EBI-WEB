"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Shared chrome for modal create/edit dialogs in the Administración panel.
 * Each per-entity page passes its strongly-typed form fields as `children`,
 * keeps the submit/API logic, and uses `error`/`busy`/`submitLabel`/`onCancel`
 * to wire the footer buttons. The Dialog wrapper keeps the chrome consistent
 * across entities (titles, buttons, error slot) so the table stays generic.
 */
export interface EntityFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel?: string;
  submittingLabel?: string;
  busy: boolean;
  error?: string | null;
  onSubmit: () => void;
  onCancel: () => void;
  children: React.ReactNode;
  sizeClassName?: string;
}

export function EntityFormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel = "Guardar",
  submittingLabel = "Guardando…",
  busy,
  error,
  onSubmit,
  onCancel,
  children,
  sizeClassName = "sm:max-w-2xl",
}: EntityFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={sizeClassName}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="max-h-[calc(100vh-16rem)] overflow-auto pr-1">{children}</div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={busy}>
            {busy ? submittingLabel : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}