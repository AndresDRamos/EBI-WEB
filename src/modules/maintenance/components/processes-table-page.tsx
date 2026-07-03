"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Cog } from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
import { useCan } from "@/components/providers/permissions-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface ProcessesTableRow {
  process_id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface ProcessesTablePageProps {
  processes: ProcessesTableRow[];
}

/** Procesos catalog — manufacturing processes assets can execute. Actions
 * gate per-permission via `useCan` (plan 0006); the API re-checks. */
export function ProcessesTablePage({
  processes,
}: ProcessesTablePageProps) {
  const can = useCan();
  const router = useRouter();
  const [modalState, setModalState] = React.useState<{
    open: boolean;
    editId: number | null;
  }>({ open: false, editId: null });

  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  function resetForm() {
    setCode("");
    setName("");
    setDescription("");
    setError(null);
  }

  function openCreate() {
    resetForm();
    setModalState({ open: true, editId: null });
  }

  function openEdit(row: ProcessesTableRow) {
    setCode(row.code);
    setName(row.name);
    setDescription(row.description ?? "");
    setError(null);
    setModalState({ open: true, editId: row.process_id });
  }

  async function onSubmit() {
    setError(null);
    if (!code.trim() || !name.trim()) {
      setError("Código y nombre son obligatorios.");
      return;
    }
    setBusy(true);
    try {
      const id = modalState.editId;
      const url = id ? `/api/maintenance/processes/${id}` : "/api/maintenance/processes";
      const method = id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          description: description.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo guardar el proceso.");
      }
      resetForm();
      setModalState({ open: false, editId: null });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  async function onSoftDelete(
    row: ProcessesTableRow,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/maintenance/processes/${row.process_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: d.error ?? "No se pudo desactivar el proceso." };
    }
    router.refresh();
    return { ok: true };
  }

  async function onHardDelete(
    row: ProcessesTableRow,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/maintenance/processes/${row.process_id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return {
        ok: false,
        error:
          d.error ?? "No se pudo eliminar el proceso (¿tiene equipos vinculados?).",
      };
    }
    router.refresh();
    return { ok: true };
  }

  async function onRestore(
    row: ProcessesTableRow,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/maintenance/processes/${row.process_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: d.error ?? "No se pudo reactivar el proceso." };
    }
    router.refresh();
    return { ok: true };
  }

  const columns: ColumnDef<ProcessesTableRow>[] = React.useMemo(
    () => [
      {
        key: "code",
        header: "Código",
        accessor: (r) => r.code,
        filter: { kind: "text" },
        render: (r) => <span className="font-mono">{r.code}</span>,
        className: "w-32",
      },
      {
        key: "name",
        header: "Nombre",
        accessor: (r) => r.name,
        filter: { kind: "text" },
        render: (r) => <span className="font-medium">{r.name}</span>,
      },
      {
        key: "description",
        header: "Descripción",
        accessor: (r) => r.description ?? "",
        filter: { kind: "text" },
        render: (r) =>
          r.description ? (
            <span className="whitespace-normal">{r.description}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        className: "min-w-[20rem]",
      },
    ],
    [],
  );

  return (
    <>
      <DataTable
        icon={Cog}
        title="Procesos"
        subtitle="Catálogo de procesos de manufactura. Un equipo puede ejecutar varios procesos."
        rows={processes}
        getRowId={(r) => r.process_id}
        columns={columns}
        isActive={(r) => r.is_active}
        onAdd={can("maintenance.process:create") ? openCreate : undefined}
        onEdit={can("maintenance.process:update") ? openEdit : undefined}
        onSoftDelete={can("maintenance.process:update") ? onSoftDelete : undefined}
        onHardDelete={can("maintenance.process:delete") ? onHardDelete : undefined}
        onRestore={can("maintenance.process:update") ? onRestore : undefined}
        addLabel="Nuevo proceso"
        onAfterChange={() => router.refresh()}
      />
      <EntityFormDialog
        open={modalState.open}
        onOpenChange={(open) => {
          setModalState((prev) => ({ open, editId: open ? prev.editId : null }));
          if (!open) resetForm();
        }}
        title={modalState.editId === null ? "Nuevo proceso" : "Editar proceso"}
        busy={busy}
        error={error}
        onSubmit={onSubmit}
        onCancel={() => {
          setModalState({ open: false, editId: null });
          resetForm();
        }}
        submitLabel={modalState.editId === null ? "Crear proceso" : "Guardar cambios"}
        sizeClassName="sm:max-w-lg"
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="process-code">Código *</Label>
              <Input
                id="process-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={32}
                disabled={busy}
                placeholder="p. ej. WELD"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="process-name">Nombre *</Label>
              <Input
                id="process-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={160}
                disabled={busy}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="process-description">Descripción</Label>
            <Textarea
              id="process-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={512}
              rows={3}
              disabled={busy}
            />
          </div>
        </div>
      </EntityFormDialog>
    </>
  );
}
