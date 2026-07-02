"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface DepartmentsTableRow {
  department_id: number;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface DepartmentsTablePageProps {
  departments: DepartmentsTableRow[];
}

/** Departamentos admin table — CRUD with description. */
export function DepartmentsTablePage({
  departments,
}: DepartmentsTablePageProps) {
  const router = useRouter();
  const [modalState, setModalState] = React.useState<{
    open: boolean;
    editId: number | null;
  }>({ open: false, editId: null });

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  function resetForm() {
    setName("");
    setDescription("");
    setError(null);
  }

  function openCreate() {
    resetForm();
    setModalState({ open: true, editId: null });
  }

  function openEdit(row: DepartmentsTableRow) {
    setName(row.name);
    setDescription(row.description ?? "");
    setError(null);
    setModalState({ open: true, editId: row.department_id });
  }

  async function onSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setBusy(true);
    try {
      const id = modalState.editId;
      const url = id ? `/api/departments/${id}` : "/api/departments";
      const method = id ? "PUT" : "POST";
      const body = JSON.stringify({
        name: name.trim(),
        description: description.trim() || null,
      });
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo guardar el departamento.");
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
    row: DepartmentsTableRow,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/departments/${row.department_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return {
        ok: false,
        error: d.error ?? "No se pudo desactivar el departamento.",
      };
    }
    router.refresh();
    return { ok: true };
  }

  async function onHardDelete(
    row: DepartmentsTableRow,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/departments/${row.department_id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return {
        ok: false,
        error:
          d.error ??
          "No se pudo eliminar el departamento (¿tiene usuarios asignados?).",
      };
    }
    router.refresh();
    return { ok: true };
  }

  const columns: ColumnDef<DepartmentsTableRow>[] = React.useMemo(
    () => [
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
      },
    ],
    [],
  );

  return (
    <>
      <DataTable
        icon={Building2}
        title="Departamentos"
        subtitle="Catálogo de departamentos asignable a los usuarios."
        rows={departments}
        getRowId={(r) => r.department_id}
        columns={columns}
        isActive={(r) => r.is_active}
        onAdd={openCreate}
        onEdit={openEdit}
        onSoftDelete={onSoftDelete}
        onHardDelete={onHardDelete}
        canDelete={() => true}
        addLabel="Nuevo departamento"
        onAfterChange={() => router.refresh()}
      />
      <EntityFormDialog
        open={modalState.open}
        onOpenChange={(open) => {
          setModalState((prev) => ({ open, editId: open ? prev.editId : null }));
          if (!open) resetForm();
        }}
        title={
          modalState.editId === null ? "Nuevo departamento" : "Editar departamento"
        }
        busy={busy}
        error={error}
        onSubmit={onSubmit}
        onCancel={() => {
          setModalState({ open: false, editId: null });
          resetForm();
        }}
        submitLabel={
          modalState.editId === null ? "Crear departamento" : "Guardar cambios"
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dept-name">Nombre *</Label>
            <Input
              id="dept-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={160}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dept-description">Descripción</Label>
            <Textarea
              id="dept-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={256}
              rows={3}
            />
          </div>
        </div>
      </EntityFormDialog>
    </>
  );
}