"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { Badge } from "@/components/ui/badge";
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface RolesTableRow {
  role_id: number;
  name: string;
  description: string | null;
  department_id: number | null;
  department_name: string | null;
  is_active: boolean;
}

export interface DepartmentOption {
  department_id: number;
  name: string;
}

export interface RolesTablePageProps {
  roles: RolesTableRow[];
  departments: DepartmentOption[];
}

/** Role protected from rename / deactivate / delete at the app layer. */
const PROTECTED_ROLE = "admin";

/**
 * Access-profile admin table (rol = perfil de acceso since V8 / ADR 0004).
 * A profile may be scoped to a department ("Técnico Mantenimiento") or be
 * cross-department (sin departamento, like `admin`). Only `admin` is
 * protected; the rest are normal CRUD.
 */
export function RolesTablePage({ roles, departments }: RolesTablePageProps) {
  const router = useRouter();
  const [modalState, setModalState] = React.useState<{
    open: boolean;
    editId: number | null;
  }>({ open: false, editId: null });

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  function resetForm() {
    setName("");
    setDescription("");
    setDepartmentId("");
    setError(null);
  }

  function openCreate() {
    resetForm();
    setModalState({ open: true, editId: null });
  }

  function openEdit(row: RolesTableRow) {
    setName(row.name);
    setDescription(row.description ?? "");
    setDepartmentId(row.department_id === null ? "" : String(row.department_id));
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
        department_id: departmentId === "" ? null : Number(departmentId),
      });
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo guardar el perfil.");
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
      return { ok: false, error: d.error ?? "No se pudo desactivar el perfil." };
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
          "No se pudo eliminar el perfil (¿tiene usuarios asignados?).",
      };
    }
    router.refresh();
    return { ok: true };
  }

  async function onRestore(
    row: RolesTableRow,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/roles/${row.role_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: d.error ?? "No se pudo reactivar el perfil." };
    }
    router.refresh();
    return { ok: true };
  }

  const departmentOptions = React.useMemo(
    () =>
      [...new Set(roles.map((r) => r.department_name ?? "Transversal"))].map(
        (n) => ({ value: n, label: n }),
      ),
    [roles],
  );

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
        key: "department",
        header: "Departamento",
        accessor: (r) => r.department_name ?? "Transversal",
        filter: { kind: "catalog", options: departmentOptions },
        render: (r) =>
          r.department_name ? (
            <span>{r.department_name}</span>
          ) : (
            <span className="text-muted-foreground">Transversal</span>
          ),
        className: "w-44",
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
    [departmentOptions],
  );

  const isEditingProtected =
    modalState.editId !== null &&
    roles.find((r) => r.role_id === modalState.editId)?.name === PROTECTED_ROLE;

  return (
    <>
      <DataTable
        icon={ShieldCheck}
        title="Perfiles de acceso"
        subtitle="Un perfil combina puesto y departamento (sin departamento = transversal). 'admin' no se puede renombrar, desactivar ni eliminar."
        rows={roles}
        getRowId={(r) => r.role_id}
        columns={columns}
        isActive={(r) => r.is_active}
        onAdd={openCreate}
        onEdit={openEdit}
        onSoftDelete={onSoftDelete}
        onHardDelete={onHardDelete}
        onRestore={onRestore}
        canEdit={() => true}
        canDelete={(r) => r.name !== PROTECTED_ROLE}
        addLabel="Nuevo perfil"
        onAfterChange={() => router.refresh()}
      />
      <EntityFormDialog
        open={modalState.open}
        onOpenChange={(open) => {
          setModalState((prev) => ({ open, editId: open ? prev.editId : null }));
          if (!open) resetForm();
        }}
        title={modalState.editId === null ? "Nuevo perfil de acceso" : "Editar perfil de acceso"}
        description={
          isEditingProtected
            ? `El rol '${PROTECTED_ROLE}' no se puede renombrar ni desactivar.`
            : "Defina nombre, departamento y descripción del perfil."
        }
        busy={busy}
        error={error}
        onSubmit={onSubmit}
        onCancel={() => {
          setModalState({ open: false, editId: null });
          resetForm();
        }}
        submitLabel={modalState.editId === null ? "Crear perfil" : "Guardar cambios"}
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
              placeholder="p. ej. Técnico Mantenimiento"
            />
            {isEditingProtected ? (
              <p className="text-xs text-muted-foreground">
                Este rol está protegido; el cambio de nombre se rechazará en el servidor.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-department">Departamento</Label>
            <Select
              id="role-department"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              disabled={busy || Boolean(isEditingProtected)}
            >
              <option value="">Transversal (todos los departamentos)</option>
              {departments.map((d) => (
                <option key={d.department_id} value={d.department_id}>
                  {d.name}
                </option>
              ))}
            </Select>
            {isEditingProtected ? (
              <p className="text-xs text-muted-foreground">
                El perfil protegido es transversal por definición.
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
              placeholder="¿Qué permite hacer este perfil?"
            />
          </div>
        </div>
      </EntityFormDialog>
    </>
  );
}
