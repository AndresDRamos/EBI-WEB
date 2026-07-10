import * as React from "react";
import { apiMutate } from "@/lib/api-client";

interface CurrentAssignment {
  assignment_id: number;
  cell_id: number;
}

/**
 * Reconciles a machine modal's pending cell choice with the live
 * `asset_cell_assignment` row: close the current one and/or open a new one.
 * `pendingCellId`: the user's choice while editing — `null` = "Sin celda",
 * `undefined` = untouched (keep whatever is currently assigned).
 */
export function useCellAssignment(
  canAssignCell: boolean,
  currentAssignment: CurrentAssignment | null,
) {
  const [pendingCellId, setPendingCellId] = React.useState<number | null | undefined>(
    undefined,
  );
  const [error, setError] = React.useState<string | null>(null);

  async function sync(savedAssetId: number) {
    if (!canAssignCell || pendingCellId === undefined) return;
    setError(null);
    try {
      const targetCellId = pendingCellId;
      const current = currentAssignment;
      if (current && current.cell_id === targetCellId) return;
      if (current) {
        // The server may have closed it already if the location changed —
        // a 409 ("already closed") is fine, anything else surfaces.
        const res = await fetch(
          `/api/production/assignments/${current.assignment_id}/close`,
          { method: "POST" },
        );
        if (!res.ok && res.status !== 409) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(d.error ?? "No se pudo cerrar la asignación de celda.");
        }
      }
      if (targetCellId !== null) {
        await apiMutate(`/api/production/cells/${targetCellId}/assignments`, {
          method: "POST",
          body: { asset_id: savedAssetId },
          fallback: "No se pudo asignar la celda.",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la celda.");
    } finally {
      setPendingCellId(undefined);
    }
  }

  function reset() {
    setPendingCellId(undefined);
    setError(null);
  }

  return { pendingCellId, setPendingCellId, error, sync, reset };
}
