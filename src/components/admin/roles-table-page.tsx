"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { EntityFormDialog } from "@/components/admin/entity-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface RolesTableRow {
  role_id: number;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface RolesTablePageProps {
  roles: RolesTableRow[];
}

/** Role protected from rename / deactivate / delete at the app layer. */
const PROTECTED_ROLE = "admin";

/** Roles admin table. Only `admin` is protected; `viewer` and the rest are normal CRUD. */
export function RolesTablePage({ roles }: RolesTablePageProps) {
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

  function openEdit(row: RolesTableRow) {
    setName(row.name);
    setDescription(row.description ?? "");
    setError(null);
    setModalState({ open: true, editId: row.role_id });
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
      const url = id ? `/api/roles/${id}` : "/api/roles";
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
        throw new Error(d.error ?? "No se pudo guardar el rol.");
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
    row: RolesTableRow,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/roles/${row.role_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: d.error ?? "No se pudo desactivar el rol." };
    }
    router.refresh();
    return { ok: true };
  }

  async function onHardDelete(
    row: RolesTableRow,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/roles/${row.role_id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return {
        ok: false,
        error:
          d.error ??
          "No se pudo eliminar el rol (¿tiene usuarios asignados?).",
      };
    }
    router.refresh();
    return { ok: true };
  }

  const columns: ColumnDef<RolesTableRow>[] = React.useMemo(
    () => [
      {
        key: "name",
        header: "Nombre",
        accessor: (r) => r.name,
        filter: { kind: "text" },
        render: (r) => (
          <span className="flex items-center gap-2">
            <span className="font-medium">{r.name}</span>
            {r.name === PROTECTED_ROLE ? (
              <Badge variant="muted">protegido</Badge>
            ) : null}
          </span>
        ),
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

  const isEditingProtected =
    modalState.editId !== null &&
    roles.find((r) => r.role_id === modalState.editId)?.name === PROTECTED_ROLE;

  return (
    <>
      <DataTable
        icon={ShieldCheck}
        title="Roles"
        subtitle="Roles RBAC. 'admin' no se puede renombrar, desactivar ni eliminar; el resto son CRUD normales."
        rows={roles}
        getRowId={(r) => r.role_id}
        columns={columns}
        isActive={(r) => r.is_active}
        onAdd={openCreate}
        onEdit={openEdit}
        onSoftDelete={onSoftDelete}
        onHardDelete={onHardDelete}
        canEdit={() => true}
        canDelete={(r) => r.name !== PROTECTED_ROLE}
        addLabel="Nuevo rol"
        onAfterChange={() => router.refresh()}
      />
      <EntityFormDialog
        open={modalState.open}
        onOpenChange={(open) => {
          setModalState((prev) => ({ open, editId: open ? prev.editId : null }));
          if (!open) resetForm();
        }}
        title={modalState.editId === null ? "Nuevo rol" : "Editar rol"}
        description={
          isEditingProtected
            ? `El rol '${PROTECTED_ROLE}' no se puede renombrar ni desactivar.`
            : "Defina nombre y descripción del rol."
        }
        busy={busy}
        error={error}
        onSubmit={onSubmit}
        onCancel={() => {
          setModalState({ open: false, editId: null });
          resetForm();
        }}
        submitLabel={modalState.editId === null ? "Crear rol" : "Guardar cambios"}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="role-name">Nombre *</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              disabled={busy}
              placeholder="p. ej. operador"
            />
            {isEditingProtected ? (
              <p className="text-xs text-muted-foreground">
                Este rol está protegido; el cambio de nombre se rechazará en el servidor.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-description">Descripción</Label>
            <Textarea
              id="role-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={256}
              rows={3}
              placeholder="¿Qué permite hacer este rol?"
            />
          </div>
        </div>
      </EntityFormDialog>
    </>
  );
}