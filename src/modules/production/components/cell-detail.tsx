"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, Plus, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
import { useCan } from "@/components/providers/permissions-provider";

export interface CellDetailCell {
  cell_id: number;
  code: string;
  name: string;
  plant_name: string;
  line_code: string | null;
  line_name: string | null;
  sequence_in_line: number | null;
  is_active: boolean;
}

export interface CellAssignmentItem {
  assignment_id: number;
  asset_id: number;
  asset_code: string;
  asset_name: string;
  role_label: string | null;
  valid_from: string;
  valid_to: string | null;
  note: string | null;
}

export interface AssetOption {
  asset_id: number;
  code: string;
  name: string;
}

export interface CellOption {
  cell_id: number;
  code: string;
  name: string;
}

export interface CellDetailProps {
  cell: CellDetailCell;
  current: CellAssignmentItem[];
  history: CellAssignmentItem[];
  /** Active assets available to assign (full catalog; the API 409s duplicates). */
  assets: AssetOption[];
  /** Other active cells — reassignment targets. */
  otherCells: CellOption[];
}

/** Cell detail: header + current composition (assign / reassign / close) +
 * read-only closed history. Reassigning closes the current row and opens a
 * new one — the history below never rewrites. */
export function CellDetail({
  cell,
  current,
  history,
  assets,
  otherCells,
}: CellDetailProps) {
  const can = useCan();
  const router = useRouter();

  const [assignOpen, setAssignOpen] = React.useState(false);
  const [reassignTarget, setReassignTarget] =
    React.useState<CellAssignmentItem | null>(null);
  const [closeTarget, setCloseTarget] =
    React.useState<CellAssignmentItem | null>(null);
  const [closeBusy, setCloseBusy] = React.useState(false);
  const [closeError, setCloseError] = React.useState<string | null>(null);

  async function onCloseAssignment() {
    if (!closeTarget) return;
    setCloseError(null);
    setCloseBusy(true);
    try {
      const res = await fetch(
        `/api/production/assignments/${closeTarget.assignment_id}/close`,
        { method: "POST" },
      );
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo cerrar la asignación.");
      }
      setCloseTarget(null);
      router.refresh();
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCloseBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/production/cells"
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground hover:bg-gray-100"
            aria-label="Volver a celdas"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">{cell.name}</h1>
              {!cell.is_active ? (
                <Badge variant="outline" className="border-gray-300 text-gray-500">
                  Inactiva
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{cell.code}</span>
              {" · "}
              {cell.plant_name}
              {cell.line_code ? (
                <>
                  {" · Línea "}
                  <span className="font-mono">{cell.line_code}</span>
                  {cell.sequence_in_line != null
                    ? ` (Op ${cell.sequence_in_line})`
                    : ""}
                </>
              ) : (
                " · Celda independiente"
              )}
            </p>
          </div>
        </div>
        {can("production.assignment:create") ? (
          <Button onClick={() => setAssignOpen(true)}>
            <Plus className="h-4 w-4" />
            Asignar equipo
          </Button>
        ) : null}
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Composición vigente
        </p>
        {current.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin equipos asignados a esta celda.
          </p>
        ) : (
          <ul className="divide-y">
            {current.map((a) => (
              <li key={a.assignment_id} className="flex items-center gap-3 py-2.5">
                <Link
                  href={`/maintenance/machines/${encodeURIComponent(a.asset_code)}`}
                  className="shrink-0 font-mono text-sm font-medium text-ezi-gray underline-offset-2 hover:text-ezi-orange hover:underline"
                >
                  {a.asset_code}
                </Link>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {a.asset_name}
                  {a.role_label ? (
                    <span className="text-muted-foreground"> · {a.role_label}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  desde {a.valid_from.slice(0, 10)}
                </span>
                {can("production.assignment:close") ? (
                  <span className="flex shrink-0 items-center gap-1">
                    {can("production.assignment:create") ? (
                      <button
                        type="button"
                        onClick={() => setReassignTarget(a)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-gray-100 hover:text-ezi-gray"
                        aria-label={`Reasignar ${a.asset_code}`}
                        title="Reasignar a otra celda"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setCloseError(null);
                        setCloseTarget(a);
                      }}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-orange-50 hover:text-ezi-orange"
                      aria-label={`Cerrar asignación de ${a.asset_code}`}
                      title="Cerrar asignación"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {history.length > 0 ? (
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Historial (asignaciones cerradas)
          </p>
          <ul className="divide-y">
            {history.map((a) => (
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

      <AssignDialog
        open={assignOpen}
        cellId={cell.cell_id}
        assets={assets}
        onOpenChange={setAssignOpen}
        onSaved={() => {
          setAssignOpen(false);
          router.refresh();
        }}
      />
      <ReassignDialog
        assignment={reassignTarget}
        otherCells={otherCells}
        onOpenChange={(open) => {
          if (!open) setReassignTarget(null);
        }}
        onSaved={() => {
          setReassignTarget(null);
          router.refresh();
        }}
      />

      <AlertDialog
        open={closeTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setCloseTarget(null);
            setCloseError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar la asignación?</AlertDialogTitle>
            <AlertDialogDescription>
              {closeTarget
                ? `${closeTarget.asset_code} dejará de estar asignado a esta celda. La fila se conserva en el historial; no se elimina nada.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {closeError ? (
            <p className="text-sm text-destructive" role="alert">
              {closeError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={closeBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void onCloseAssignment();
              }}
              disabled={closeBusy}
              className="bg-ezi-orange"
            >
              {closeBusy ? "Cerrando…" : "Cerrar asignación"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Asignar equipo
// ---------------------------------------------------------------------------

interface AssignDialogProps {
  open: boolean;
  cellId: number;
  assets: AssetOption[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/** Remounted via `key` when it opens, so `useState` initializers re-seed
 * without effects (house pattern — see MachineFormDialog). */
function AssignDialog(props: AssignDialogProps) {
  const key = props.open ? "open" : "closed";
  return <AssignDialogInner key={key} {...props} />;
}

function AssignDialogInner({
  open,
  cellId,
  assets,
  onOpenChange,
  onSaved,
}: AssignDialogProps) {
  const [assetId, setAssetId] = React.useState("");
  const [roleLabel, setRoleLabel] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit() {
    setError(null);
    if (!assetId) {
      setError("Selecciona un equipo.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/production/cells/${cellId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: Number(assetId),
          role_label: roleLabel.trim() || null,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo asignar el equipo.");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Asignar equipo a la celda"
      busy={busy}
      error={error}
      onSubmit={onSubmit}
      onCancel={() => onOpenChange(false)}
      submitLabel="Asignar"
      sizeClassName="sm:max-w-lg"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="assign-asset">Equipo *</Label>
          <Select
            id="assign-asset"
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            disabled={busy}
          >
            <option value="">Selecciona…</option>
            {assets.map((a) => (
              <option key={a.asset_id} value={a.asset_id}>
                {a.code} — {a.name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Un mismo equipo puede servir a varias celdas a la vez (p. ej. una
            torre de surtimiento compartida).
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="assign-role">Rol en la celda</Label>
          <Input
            id="assign-role"
            value={roleLabel}
            onChange={(e) => setRoleLabel(e.target.value)}
            maxLength={120}
            disabled={busy}
            placeholder="p. ej. Posición 1 · Surtimiento compartido"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="assign-note">Nota</Label>
          <Textarea
            id="assign-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={2}
            disabled={busy}
          />
        </div>
      </div>
    </EntityFormDialog>
  );
}

// ---------------------------------------------------------------------------
// Reasignar (cerrar + abrir contra otra celda, transaccional en el API)
// ---------------------------------------------------------------------------

interface ReassignDialogProps {
  assignment: CellAssignmentItem | null;
  otherCells: CellOption[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/** Remounted via `key` per target assignment, so `useState` initializers
 * re-seed without effects (house pattern — see MachineFormDialog). */
function ReassignDialog(props: ReassignDialogProps) {
  const key = props.assignment
    ? `open-${props.assignment.assignment_id}`
    : "closed";
  return <ReassignDialogInner key={key} {...props} />;
}

function ReassignDialogInner({
  assignment,
  otherCells,
  onOpenChange,
  onSaved,
}: ReassignDialogProps) {
  const open = assignment !== null;
  const [toCellId, setToCellId] = React.useState("");
  const [roleLabel, setRoleLabel] = React.useState(
    assignment?.role_label ?? "",
  );
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit() {
    if (!assignment) return;
    setError(null);
    if (!toCellId) {
      setError("Selecciona la celda destino.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/production/assignments/${assignment.assignment_id}/reassign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to_cell_id: Number(toCellId),
            role_label: roleLabel.trim() || null,
            note: note.trim() || null,
          }),
        },
      );
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo reasignar el equipo.");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        assignment
          ? `Reasignar ${assignment.asset_code} a otra celda`
          : "Reasignar equipo"
      }
      busy={busy}
      error={error}
      onSubmit={onSubmit}
      onCancel={() => onOpenChange(false)}
      submitLabel="Reasignar"
      sizeClassName="sm:max-w-lg"
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Se cierra la asignación vigente y se abre una nueva en la celda
          destino. El historial conserva ambas filas.
        </p>
        <div className="space-y-2">
          <Label htmlFor="reassign-cell">Celda destino *</Label>
          <Select
            id="reassign-cell"
            value={toCellId}
            onChange={(e) => setToCellId(e.target.value)}
            disabled={busy}
          >
            <option value="">Selecciona…</option>
            {otherCells.map((c) => (
              <option key={c.cell_id} value={c.cell_id}>
                {c.code} — {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="reassign-role">Rol en la celda destino</Label>
          <Input
            id="reassign-role"
            value={roleLabel}
            onChange={(e) => setRoleLabel(e.target.value)}
            maxLength={120}
            disabled={busy}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reassign-note">Nota</Label>
          <Textarea
            id="reassign-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={2}
            disabled={busy}
            placeholder="p. ej. Cambio por balanceo de línea"
          />
        </div>
      </div>
    </EntityFormDialog>
  );
}
