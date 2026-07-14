/** Client-safe formatters for the sequencing UI (no server-only imports). */

/** Flat per-nesting setup allowance (minutes). Mirrors the server-side
 * `SETUP_MINUTES` in the planning db layer; duplicated here because the db
 * module is `server-only`. v1 does NOT model finite capacity. */
export const SETUP_MINUTES = 15;

/** Loaded minutes for one entry (cut + fixed setup). */
export function entryMinutes(cutMinutes: number | null): number {
  return (cutMinutes ?? 0) + SETUP_MINUTES;
}

/** Minutes → "2 h 30 min" / "45 min" / "0 min". */
export function formatMinutes(min: number | null | undefined): string {
  const m = Math.round(min ?? 0);
  if (m <= 0) return "0 min";
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem} min`;
  if (rem === 0) return `${h} h`;
  return `${h} h ${rem} min`;
}

/** Downstream route-step seconds → compact minutes label ("3 min"). */
export function secondsToMinLabel(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const min = seconds / 60;
  return min >= 1 ? `${Math.round(min)} min` : `${seconds} s`;
}

/** Whole days between an ISO date and now, as "hoy" / "hace 3 d". */
export function ageLabel(iso: string | Date | null): string {
  if (!iso) return "—";
  const then = typeof iso === "string" ? new Date(iso) : iso;
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "hoy";
  if (days === 1) return "hace 1 d";
  return `hace ${days} d`;
}

export type MaterialStatus = "in_progress" | "issued" | "requested" | "pending";

/** Derive a nesting's lifecycle badge from its EPS dates. */
export function materialStatus(n: {
  started_at: string | Date | null;
  material_issued_at: string | Date | null;
  material_requested_at: string | Date | null;
}): MaterialStatus {
  if (n.started_at) return "in_progress";
  if (n.material_issued_at) return "issued";
  if (n.material_requested_at) return "requested";
  return "pending";
}

export const MATERIAL_STATUS_META: Record<
  MaterialStatus,
  { label: string; variant: "info" | "success" | "warning" | "muted" }
> = {
  in_progress: { label: "En proceso", variant: "info" },
  issued: { label: "Surtido", variant: "success" },
  requested: { label: "Solicitado", variant: "warning" },
  pending: { label: "Pendiente", variant: "muted" },
};

export const PROGRAM_STATUS_META: Record<
  string,
  { label: string; variant: "muted" | "success" | "secondary" }
> = {
  draft: { label: "Borrador", variant: "muted" },
  published: { label: "Publicado", variant: "success" },
  archived: { label: "Archivado", variant: "secondary" },
};

/** Short Spanish date label, e.g. "lun 14 jul". */
export function dateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
}

/** ETL staleness heuristic, computed with an explicit `nowMs` so it can run on
 * the server (no `Date.now()` in client render). Warns when a load failed,
 * never ran, or the freshest load is older than `staleMinutes` (≈ 2× the
 * suggested 15-min cadence). */
export function computeStaleWarning(
  freshness: { entity: string; status: string | null; finished_at: string | Date | null }[],
  nowMs: number,
  staleMinutes = 30,
): string | null {
  if (freshness.length === 0) return "El ETL aún no ha corrido: no hay datos de EPS cargados.";
  const failed = freshness.find((f) => f.status !== "success");
  if (failed) return `La última corrida del ETL para "${failed.entity}" no fue exitosa.`;
  const times = freshness
    .map((f) => (f.finished_at ? new Date(f.finished_at).getTime() : null))
    .filter((t): t is number => t !== null);
  if (times.length === 0) return null;
  const minutes = Math.floor((nowMs - Math.min(...times)) / 60_000);
  return minutes > staleMinutes
    ? `Datos de EPS con ${minutes} min de antigüedad — revisa que el ETL siga corriendo.`
    : null;
}
