"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import {
  GroupedDataTable,
  type GroupedChildColumn,
} from "@/components/kit/grouped-data-table";
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface DepartmentGroupRow {
  department_id: number;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface RoleChildRow {
  role_id: number;
  name: string;
  description: string | null;
  department_id: number | null;
  is_active: boolean;
}

/** Role protected from rename / deactivate / delete at the app layer. */
const PROTECTED_ROLE = "admin";

/** Sentinel group id for roles with `department_id NULL`. */
const ORPHAN_GROUP_ID = 0;

interface Group extends DepartmentGroupRow {
  synthetic?: boolean;
}

/**
 * Departamentos y roles — one grouped table: each department is a group with
 * its roles as child rows (a role only exists inside a department). Roles
 * with `department_id NULL` fall into a synthetic "Sin departamento" group
 * that only renders while such roles exist — the intent is to assign them,
 * not to keep them there. Department CRUD → /api/org/departments; role CRUD →
 * /api/org/roles (same endpoints as the retired flat tables).
 */
export function DepartmentsRolesPage({
  departments,
  roles,
}: {
  departments: DepartmentGroupRow[];
  roles: RoleChildRow[];
}) {
  const router = useRouter();

  // --- Department modal state -------------------------------------------
  const [deptModal, setDeptModal] = React.useState<{
    open: boolean;
    editId: number | null;
  }>({ open: false, editId: null });
  const [deptName, setDeptName] = React.useState("");
  const [deptDescription, setDeptDescription] = React.useState("");
  const [deptError, setDeptError] = React.useState<string | null>(null);
  const [deptBusy, setDeptBusy] = React.useState(false);

  // --- Role modal state ---------------------------------------------------
  const [roleModal, setRoleModal] = React.useState<{
    open: boolean;
    editId: number | null;
  }>({ open: false, editId: null });
  const [roleName, setRoleName] = React.useState("");
  const [roleDescription, setRoleDescription] = React.useState("");
  const [roleDepartmentId, setRoleDepartmentId] = React.useState<string>("");
  const [roleError, setRoleError] = React.useState<string | null>(null);
  const [roleBusy, setRoleBusy] = React.useState(false);

  const groups = React.useMemo<Group[]>(() => {
    const sorted = [...departments].sort((a, b) =>
      a.name.localeCompare(b.name, "es"),
    );
    const hasOrphans = roles.some((r) => r.department_id === null);
    if (!hasOrphans) return sorted;
    return [
      ...sorted,
      {
        department_id: ORPHAN_GROUP_ID,
        name: "Sin departamento",
        description: null,
        is_active: true,
        synthetic: true,
      },
    ];
  }, [departments, roles]);

  const childrenOf = React.useCallback(
    (g: Group) =>
      roles.filter((r) => (r.department_id ?? ORPHAN_GROUP_ID) === g.department_id),
    [roles],
  );

  // --- Department handlers ------------------------------------------------

  function openCreateDept() {
    setDeptName("");
    setDeptDescription("");
    setDeptError(null);
    setDeptModal({ open: true, editId: null });
  }

  function openEditDept(g: Group) {
    setDeptName(g.name);
    setDeptDescription(g.description ?? "");
    setDeptError(null);
    setDeptModal({ open: true, editId: g.department_id });
  }

  async function onSubmitDept() {
    setDeptError(null);
    if (!deptName.trim()) {
      setDeptError("El nombre es obligatorio.");
      return;
    }
    setDeptBusy(true);
    try {
      const id = deptModal.editId;
      const res = await fetch(id ? `/api/org/departments/${id}` : "/api/org/departments", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: deptName.trim(),
          description: deptDescription.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo guardar el departamento.");
      }
      setDeptModal({ open: false, editId: null });
      router.refresh();
    } catch (err) {
      setDeptError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setDeptBusy(false);
    }
  }

  async function deptAction(
    g: Group,
    init: RequestInit,
    fallback: string,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/org/departments/${g.department_id}`, init);
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: d.error ?? fallback };
    }
    router.refresh();
    return { ok: true };
  }

  // --- Role handlers --------------------------------------------------------

  function openCreateRole(g: Group) {
    setRoleName("");
    setRoleDescription("");
    setRoleDepartmentId(g.synthetic ? "" : String(g.department_id));
    setRoleError(null);
    setRoleModal({ open: true, editId: null });
  }

  function openEditRole(r: RoleChildRow) {
    setRoleName(r.name);
    setRoleDescription(r.description ?? "");
    setRoleDepartmentId(r.department_id === null ? "" : String(r.department_id));
    setRoleError(null);
    setRoleModal({ open: true, editId: r.role_id });
  }

  async function onSubmitRole() {
    setRoleError(null);
    if (!roleName.trim()) {
      setRoleError("El nombre es obligatorio.");
      return;
    }
    setRoleBusy(true);
    try {
      const id = roleModal.editId;
      const res = await fetch(id ? `/api/org/roles/${id}` : "/api/org/roles", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: roleName.trim(),
          description: roleDescription.trim() || null,
          department_id: roleDepartmentId === "" ? null : Number(roleDepartmentId),
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo guardar el rol.");
      }
      setRoleModal({ open: false, editId: null });
      router.refresh();
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setRoleBusy(false);
    }
  }

  async function roleAction(
    r: RoleChildRow,
    init: RequestInit,
    fallback: string,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/org/roles/${r.role_id}`, init);
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: d.error ?? fallback };
    }
    router.refresh();
    return { ok: true };
  }

  const childColumns: GroupedChildColumn<RoleChildRow>[] = React.useMemo(
    () => [
      {
        key: "name",
        header: "Rol",
        render: (r) => (
          <span className="flex items-center gap-2">
            <span className="font-medium">{r.name}</span>
            {r.name === PROTECTED_ROLE ? (
              <Badge variant="muted">protegido</Badge>
            ) : null}
          </span>
        ),
        className: "w-64",
      },
      {
        key: "description",
        header: "Descripción",
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

  const isEditingProtectedRole =
    roleModal.editId !== null &&
    roles.find((r) => r.role_id === roleModal.editId)?.name === PROTECTED_ROLE;

  const activeDepartments = departments.filter((d) => d.is_active);

  return (
    <>
      <GroupedDataTable<Group, RoleChildRow>
        icon={Building2}
        title="Departamentos y roles"
        subtitle="Cada departamento agrupa sus roles (perfiles de acceso). 'admin' no se puede renombrar, desactivar ni eliminar."
        groups={groups}
        getGroupId={(g) => g.department_id}
        renderGroupTitle={(g) => (
          <span className="flex items-baseline gap-2">
            <span className={g.synthetic ? "text-muted-foreground" : "font-semibold"}>
              {g.name}
            </span>
            {g.description ? (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {g.description}
              </span>
            ) : null}
          </span>
        )}
        groupIsActive={(g) => g.is_active}
        childrenOf={childrenOf}
        getChildId={(r) => r.role_id}
        childIsActive={(r) => r.is_active}
        childColumns={childColumns}
        childNoun="rol"
        onAddGroup={openCreateDept}
        addGroupLabel="Nuevo departamento"
        onAddChild={openCreateRole}
        addChildLabel="Agregar rol"
        hasGroupActions={(g) => !g.synthetic}
        canAddChild={(g) => !g.synthetic}
        onEditGroup={openEditDept}
        onSoftDeleteGroup={(g) =>
          deptAction(
            g,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ is_active: false }),
            },
            "No se pudo desactivar el departamento.",
          )
        }
        onHardDeleteGroup={(g) =>
          deptAction(
            g,
            { method: "DELETE" },
            "No se pudo eliminar el departamento (¿tiene roles o usuarios asignados?).",
          )
        }
        onRestoreGroup={(g) =>
          deptAction(
            g,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ is_active: true }),
            },
            "No se pudo reactivar el departamento.",
          )
        }
        onEditChild={openEditRole}
        onSoftDeleteChild={(r) =>
          roleAction(
            r,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ is_active: false }),
            },
            "No se pudo desactivar el rol.",
          )
        }
        onHardDeleteChild={(r) =>
          roleAction(
            r,
            { method: "DELETE" },
            "No se pudo eliminar el rol (¿tiene usuarios asignados?).",
          )
        }
        onRestoreChild={(r) =>
          roleAction(
            r,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ is_active: true }),
            },
            "No se pudo reactivar el rol.",
          )
        }
        canDeleteChild={(r) => r.name !== PROTECTED_ROLE}
        onAfterChange={() => router.refresh()}
      />

      <EntityFormDialog
        open={deptModal.open}
        onOpenChange={(open) => {
          setDeptModal((prev) => ({ open, editId: open ? prev.editId : null }));
          if (!open) setDeptError(null);
        }}
        title={deptModal.editId === null ? "Nuevo departamento" : "Editar departamento"}
        busy={deptBusy}
        error={deptError}
        onSubmit={onSubmitDept}
        onCancel={() => setDeptModal({ open: false, editId: null })}
        submitLabel={deptModal.editId === null ? "Crear departamento" : "Guardar cambios"}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dept-name">Nombre *</Label>
            <Input
              id="dept-name"
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
              maxLength={160}
              disabled={deptBusy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dept-description">Descripción</Label>
            <Textarea
              id="dept-description"
              value={deptDescription}
              onChange={(e) => setDeptDescription(e.target.value)}
              maxLength={256}
              rows={3}
            />
          </div>
        </div>
      </EntityFormDialog>

      <EntityFormDialog
        open={roleModal.open}
        onOpenChange={(open) => {
          setRoleModal((prev) => ({ open, editId: open ? prev.editId : null }));
          if (!open) setRoleError(null);
        }}
        title={roleModal.editId === null ? "Nuevo rol" : "Editar rol"}
        description={
          isEditingProtectedRole
            ? `El rol '${PROTECTED_ROLE}' no se puede renombrar ni desactivar; su departamento sí es editable.`
            : "Defina nombre, departamento y descripción del rol."
        }
        busy={roleBusy}
        error={roleError}
        onSubmit={onSubmitRole}
        onCancel={() => setRoleModal({ open: false, editId: null })}
        submitLabel={roleModal.editId === null ? "Crear rol" : "Guardar cambios"}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="role-name">Nombre *</Label>
            <Input
              id="role-name"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              maxLength={40}
              disabled={roleBusy}
              placeholder="p. ej. Técnico Mantenimiento"
            />
            {isEditingProtectedRole ? (
              <p className="text-xs text-muted-foreground">
                Este rol está protegido; el cambio de nombre se rechazará en el servidor.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-department">Departamento</Label>
            <Select
              id="role-department"
              value={roleDepartmentId}
              onChange={(e) => setRoleDepartmentId(e.target.value)}
              disabled={roleBusy}
            >
              <option value="">Sin departamento</option>
              {activeDepartments.map((d) => (
                <option key={d.department_id} value={d.department_id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-description">Descripción</Label>
            <Textarea
              id="role-description"
              value={roleDescription}
              onChange={(e) => setRoleDescription(e.target.value)}
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
