"use client";

import * as React from "react";
import type {
  AssignmentItem,
  DocumentItem,
  RestrictionItem,
} from "@/modules/maintenance/components/machine-tabs";

export interface AssetTabsData {
  restrictions: RestrictionItem[];
  documents: DocumentItem[];
  assignments: AssignmentItem[];
}

interface AssetDetailResponse {
  restrictions: RestrictionItem[];
  documents: DocumentItem[];
  assignments: (Omit<AssignmentItem, "valid_from" | "valid_to"> & {
    valid_from: string;
    valid_to: string | null;
  })[];
}

/**
 * On-demand fetch of the data the equipment modal's tabs need but the
 * already-loaded `MachineRow` doesn't carry (restrictions/documents/
 * assignments) — `GET /api/maintenance/assets/{id}`. Only fires for an
 * existing asset; the summary panel renders instantly from the row that
 * opened the modal, so this only gates the tabs area.
 */
export function useAssetDetail(assetId: number | null) {
  const [data, setData] = React.useState<AssetTabsData | null>(null);
  const [loading, setLoading] = React.useState(assetId !== null);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [fetchKey, setFetchKey] = React.useState<{
    assetId: number | null;
    refreshKey: number;
  } | null>(null);

  // Resetting to "no asset" or flipping into "loading" for a new fetch is a
  // pure prop→state mirror — do it during render (React-sanctioned) so the
  // effect body below never calls setState synchronously, only from inside
  // the fetch's own callbacks.
  if (!fetchKey || fetchKey.assetId !== assetId || fetchKey.refreshKey !== refreshKey) {
    setFetchKey({ assetId, refreshKey });
    if (assetId === null) {
      setData(null);
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
      setError(null);
    }
  }

  React.useEffect(() => {
    if (assetId === null) return;
    let cancelled = false;
    fetch(`/api/maintenance/assets/${assetId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("No se pudo cargar el detalle del equipo.");
        return (await res.json()) as AssetDetailResponse;
      })
      .then((d) => {
        if (cancelled) return;
        setData({
          restrictions: d.restrictions,
          documents: d.documents,
          assignments: d.assignments.map((a) => ({ ...a })),
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Error inesperado.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, refreshKey]);

  return {
    data,
    loading,
    error,
    refetch: () => setRefreshKey((k) => k + 1),
    /** Optimistic local patch (e.g. after a restriction/document mutation),
     * avoiding a full refetch round-trip. */
    setData,
  };
}
