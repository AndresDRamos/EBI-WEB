"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { MachineModal } from "@/modules/maintenance/components/machine-modal";
import type { MachineRow } from "@/modules/maintenance/components/machines-cards-page";
import type {
  CellOption,
  LocationOption,
  ParentOption,
  PlantOption,
  TypeOption,
} from "@/modules/maintenance/components/machine-form-dialog";

/**
 * The QR landing surface: the same `MachineModal` content, laid flat on a
 * page with no portal chrome (`/asset/[code]`). Owns the bits the cards page
 * normally provides — editing state, the deactivate confirm dialog and the
 * post-mutation refresh.
 */
export function MachineStandaloneView({
  row,
  plants,
  locations,
  cells,
  types,
  parents,
}: {
  row: MachineRow;
  plants: PlantOption[];
  locations: LocationOption[];
  cells: CellOption[];
  types: TypeOption[];
  parents: ParentOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [isActive, setIsActive] = React.useState(row.is_active);
  const [confirmTarget, setConfirmTarget] = React.useState<{
    asset_id: number;
    code: string;
    name: string;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = React.useState(false);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);

  async function deactivate() {
    if (!confirmTarget) return;
    setConfirmError(null);
    setConfirmBusy(true);
    try {
      const res = await fetch(`/api/maintenance/assets/${confirmTarget.asset_id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo desactivar el equipo.");
      }
      setIsActive(false);
      setConfirmTarget(null);
      router.refresh();
    } catch (err) {
      setConfirmError(
        err instanceof Error ? err.message : "No se pudo completar la acción.",
      );
    } finally {
      setConfirmBusy(false);
    }
  }

  async function restore(assetId: number) {
    await fetch(`/api/maintenance/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    }).catch(() => undefined);
    setIsActive(true);
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <MachineModal
          row={row}
          plants={plants}
          locations={locations}
          cells={cells}
          types={types}
          parents={parents}
          isActive={isActive}
          editing={editing}
          onEditingChange={setEditing}
          onRequestDeactivate={(assetId, code, name) => {
            setConfirmError(null);
            setConfirmTarget({ asset_id: assetId, code, name });
          }}
          onRestore={(assetId) => void restore(assetId)}
          onMutated={() => router.refresh()}
          standalone
        />
      </div>

      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmTarget(null);
            setConfirmError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar el equipo?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget
                ? `${confirmTarget.code} — ${confirmTarget.name} se marcará como inactivo. Podrás reactivarlo después.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmError ? (
            <p className="text-sm text-destructive" role="alert">
              {confirmError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-ezi-orange"
              disabled={confirmBusy}
              onClick={(e) => {
                e.preventDefault();
                void deactivate();
              }}
            >
              {confirmBusy ? "Procesando…" : "Desactivar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
