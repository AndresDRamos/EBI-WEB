"use client";

import * as React from "react";
import Link from "next/link";
import { Boxes } from "lucide-react";

export interface AssignmentItem {
  assignment_id: number;
  asset_id: number;
  asset_code: string;
  asset_name: string;
  asset_model: string | null;
  asset_serial_number: string | null;
  asset_has_image: boolean;
  role_label: string | null;
  valid_from: string;
  valid_to: string | null;
}

/** Read-only current composition + closed history. Assignments are managed
 * from Mantenimiento → Equipos; this view only reflects them. */
export function CellComposition({ cellId }: { cellId: number }) {
  const [data, setData] = React.useState<{
    current: AssignmentItem[];
    history: AssignmentItem[];
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/production/cells/${cellId}/assignments`)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const d = (await res.json()) as {
          current: AssignmentItem[];
          history: AssignmentItem[];
        };
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo cargar la composición.");
      });
    return () => {
      cancelled = true;
    };
  }, [cellId]);

  return (
    <>
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Composición vigente
          </p>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Boxes className="h-3.5 w-3.5" />
            Se gestiona desde Mantenimiento → Equipos
          </span>
        </div>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : data === null ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : data.current.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin equipos asignados a esta celda.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.current.map((a) => (
              <li
                key={a.assignment_id}
                className="flex gap-3 rounded-lg border bg-gray-50/60 p-3"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-white">
                  {a.asset_has_image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- SAS-redirect URL, not optimizable
                    <img
                      src={`/api/maintenance/assets/${a.asset_id}/image`}
                      alt={`Imagen de ${a.asset_name}`}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/maintenance/machines?asset=${encodeURIComponent(a.asset_code)}`}
                      className="truncate font-mono text-xs font-semibold text-ezi-gray underline-offset-2 hover:text-ezi-orange hover:underline"
                    >
                      {a.asset_code}
                    </Link>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      desde {a.valid_from.slice(0, 10)}
                    </span>
                  </div>
                  <p className="truncate text-sm font-medium text-ezi-gray">
                    {a.asset_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.asset_model ?? "—"}
                    {a.asset_serial_number ? ` · S/N ${a.asset_serial_number}` : ""}
                  </p>
                  {a.role_label ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {a.role_label}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data !== null && data.history.length > 0 ? (
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Historial (asignaciones cerradas)
          </p>
          <ul className="divide-y">
            {data.history.map((a) => (
              <li
                key={a.assignment_id}
                className="flex items-center gap-3 py-2 text-muted-foreground"
              >
                <span className="shrink-0 font-mono text-sm">{a.asset_code}</span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {a.asset_name}
                  {a.role_label ? <span> · {a.role_label}</span> : null}
                </span>
                <span className="shrink-0 text-xs">
                  {a.valid_from.slice(0, 10)} → {a.valid_to?.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
