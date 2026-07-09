"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { Badge } from "@/components/ui/badge";
import {
  UserFormDialog,
  type CatalogItem,
  type UserFormInitial,
} from "./user-form";

export interface UsersTableRow {
  user_id: number;
  username: string;
  display_name: string | null;
  all_plants: boolean;
  is_active: boolean;
  roles: string[];
  plant_names: string[];
  department_names: string[];
}

export interface UsersTablePageProps {
  users: UsersTableRow[];
  roles: CatalogItem[];
  plants: CatalogItem[];
  departments: CatalogItem[];
}

const ALL_PLANTS_TOKEN = "Todas las plantas";

/**
 * Usuarios admin table: full server-side fetch (small volumes) → client-side
 * filter/sort/pagination at 50/page. Create/edit happen via the reused
 * `UserFormDialog` (Modal form body), re-opened with a fresh remount key per
 * edit so the form state always seeds from the latest DB state.
 */
export function UsersTablePage({
  users,
  roles,
  plants,
  departments,
}: UsersTablePageProps) {
  const router = useRouter();
  const [modalState, setModalState] = React.useState<{
    open: boolean;
    editKey: number | null;
    initial?: UserFormInitial;
  }>({ open: false, editKey: null });

  const roleOptions = React.useMemo(
    () =>
      roles.map((r) => ({ value: r.label, label: r.label })),
    [roles],
  );
  const deptOptions = React.useMemo(
    () =>
      departments.map((d) => ({ value: d.label, label: d.label })),
    [departments],
  );
  const plantOptions = React.useMemo(
    () => [
      { value: ALL_PLANTS_TOKEN, label: ALL_PLANTS_TOKEN },
      ...plants.map((p) => ({ value: p.label, label: p.label })),
    ],
    [plants],
  );

  const columns: ColumnDef<UsersTableRow>[] = React.useMemo(
    () => [
      {
        key: "name",
        header: "Nombre",
        accessor: (r) => r.display_name ?? "",
        filter: { kind: "text" },
      },
      {
        key: "username",
        header: "Usuario",
        accessor: (r) => r.username,
        filter: { kind: "text" },
      },
      {
        key: "departments",
        header: "Departamento(s)",
        accessor: (r) => r.department_names,
        render: (r) =>
          r.department_names.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="whitespace-normal">{r.department_names.join(", ")}</span>
          ),
        filter: { kind: "catalog", options: deptOptions },
        className: "min-w-[14rem]",
      },
      {
        key: "roles",
        header: "Rol(es)",
        accessor: (r) => r.roles,
        render: (r) =>
          r.roles.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {r.roles.map((role) => (
                <Badge key={role} variant="muted">
                  {role}
                </Badge>
              ))}
            </div>
          ),
        filter: { kind: "catalog", options: roleOptions },
        className: "min-w-[12rem]",
      },
      {
        key: "plants",
        header: "Planta(s)",
        accessor: (r) => (r.all_plants ? [ALL_PLANTS_TOKEN] : r.plant_names),
        render: (r) =>
          r.all_plants ? (
            <Badge variant="success">Todas las plantas</Badge>
          ) : r.plant_names.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="whitespace-normal">{r.plant_names.join(", ")}</span>
          ),
        filter: { kind: "catalog", options: plantOptions },
        className: "min-w-[16rem]",
      },
    ],
    [deptOptions, plantOptions, roleOptions],
  );

  function openCreate() {
    setModalState({ open: true, editKey: null });
  }

  async function openEdit(row: UsersTableRow) {
    // Lazy-fetch full detail (role_ids/plant_ids/department_ids) — the row
    // only carries names + ids for the table view; the modal form needs the
    // ids to preselect assignments.
    const res = await fetch(`/api/users/${row.user_id}`, { method: "GET" }).catch(
      () => null,
    );
    if (!res || !res.ok) return;
    const data = (await res.json().catch(() => ({}))) as {
      user?: {
        user_id: number;
        username: string;
        email: string | null;
        display_name: string | null;
        all_plants: boolean;
        is_active: boolean;
        has_password: boolean;
        roles: { role_id: number; name: string }[];
        plants: { plant_id: number; code: string; name: string }[];
        departments: { department_id: number; name: string }[];
      };
    };
    if (!data.user) return;
    const initial: UserFormInitial = {
      user_id: data.user.user_id,
      username: data.user.username,
      email: data.user.email,
      display_name: data.user.display_name,
      all_plants: data.user.all_plants,
      is_active: data.user.is_active,
      has_password: data.user.has_password,
      role_ids: data.user.roles.map((r) => r.role_id),
      plant_ids: data.user.plants.map((p) => p.plant_id),
      department_ids: data.user.departments.map((d) => d.department_id),
    };
    setModalState({ open: true, editKey: initial.user_id, initial });
  }

  async function onSoftDelete(
    row: UsersTableRow,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/users/${row.user_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: d.error ?? "No se pudo desactivar el usuario." };
    }
    router.refresh();
    return { ok: true };
  }

  // Hard delete isn't exposed on purpose (catalogs hard-delete; users stay
  // soft-deleted to preserve audit/joins). Reactivation: one click below, or
  // the edit modal's "Cuenta activa" toggle.
  async function onRestore(
    row: UsersTableRow,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/users/${row.user_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: d.error ?? "No se pudo reactivar el usuario." };
    }
    router.refresh();
    return { ok: true };
  }

  return (
    <>
      <DataTable
        icon={Users}
        title="Usuarios"
        subtitle="Cree usuarios, asigne roles/plantas/departamentos e invite."
        rows={users}
        getRowId={(r) => r.user_id}
        columns={columns}
        isActive={(r) => r.is_active}
        onAdd={openCreate}
        onEdit={openEdit}
        onSoftDelete={onSoftDelete}
        onRestore={onRestore}
        addLabel="Nuevo usuario"
        onAfterChange={() => router.refresh()}
        canDelete={() => true}
      />
      <UserFormDialog
        key={modalState.editKey === null ? "new" : `edit-${modalState.editKey}`}
        open={modalState.open}
        onOpenChange={(open) =>
          setModalState((prev) => ({ ...prev, open, initial: open ? prev.initial : undefined }))
        }
        roles={roles}
        plants={plants}
        departments={departments}
        initial={modalState.editKey === null ? undefined : modalState.initial}
      />
    </>
  );
}