"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import {
  GroupedDataTable,
  type GroupedChildColumn,
} from "@/components/kit/grouped-data-table";
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
import { useEntityCrud } from "@/components/kit/use-entity-crud";
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
 * not to keep them there. Department CRUD → /api/departments; role CRUD →
 * /api/roles (same endpoints as the retired flat tables).
 */
export function DepartmentsRolesPage({
  departments,
  roles,
}: {
  departments: DepartmentGroupRow[];
  roles: RoleChildRow[];
}) {
  const router = useRouter();

  const deptCrud = useEntityCrud<DepartmentGroupRow>({
    basePath: "/api/departments",
    getId: (d) => d.department_id,
  });
  const roleCrud = useEntityCrud<RoleChildRow, { departmentId: number | null }>({
    basePath: "/api/roles",
    getId: (r) => r.role_id,
  });

  // --- Department form fields ----------------------------------------------
  const [deptName, setDeptName] = React.useState("");
  const [deptDescription, setDeptDescription] = React.useState("");

  // --- Role form fields ------------------------------------------------------
  const [roleName, setRoleName] = React.useState("");
  const [roleDescription, setRoleDescription] = React.useState("");
  const [roleDepartmentId, setRoleDepartmentId] = React.useState<string>("");

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

  function resetDeptForm() {
    setDeptName("");
    setDeptDescription("");
  }

  function openCreateDept() {
    resetDeptForm();
    deptCrud.openCreate();
  }

  function openEditDept(g: Group) {
    setDeptName(g.name);
    setDeptDescription(g.description ?? "");
    deptCrud.openEdit(g);
  }

  async function onSubmitDept() {
    if (!deptName.trim()) {
      deptCrud.setError("El nombre es obligatorio.");
      return;
    }
    const ok = await deptCrud.submit(
      {
        name: deptName.trim(),
        description: deptDescription.trim() || null,
      },
      "No se pudo guardar el departamento.",
    );
    if (ok) resetDeptForm();
  }

  // --- Role handlers --------------------------------------------------------

  function resetRoleForm() {
    setRoleName("");
    setRoleDescription("");
    setRoleDepartmentId("");
  }

  function openCreateRole(g: Group) {
    resetRoleForm();
    const departmentId = g.synthetic ? null : g.department_id;
    setRoleDepartmentId(departmentId === null ? "" : String(departmentId));
    roleCrud.openCreate({ departmentId });
  }

  function openEditRole(r: RoleChildRow) {
    setRoleName(r.name);
    setRoleDescription(r.description ?? "");
    setRoleDepartmentId(r.department_id === null ? "" : String(r.department_id));
    roleCrud.openEdit(r, { departmentId: r.department_id });
  }

  async function onSubmitRole() {
    if (!roleName.trim()) {
      roleCrud.setError("El nombre es obligatorio.");
      return;
    }
    const ok = await roleCrud.submit(
      {
        name: roleName.trim(),
        description: roleDescription.trim() || null,
        department_id: roleDepartmentId === "" ? null : Number(roleDepartmentId),
      },
      "No se pudo guardar el rol.",
    );
    if (ok) resetRoleForm();
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
    roleCrud.modalState.editId !== null &&
    roles.find((r) => r.role_id === roleCrud.modalState.editId)?.name === PROTECTED_ROLE;

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
          deptCrud.onSoftDelete(g, "No se pudo desactivar el departamento.")
        }
        onHardDeleteGroup={(g) =>
          deptCrud.onHardDelete(
            g,
            "No se pudo eliminar el departamento (¿tiene roles o usuarios asignados?).",
          )
        }
        onRestoreGroup={(g) =>
          deptCrud.onRestore(g, "No se pudo reactivar el departamento.")
        }
        onEditChild={openEditRole}
        onSoftDeleteChild={(r) =>
          roleCrud.onSoftDelete(r, "No se pudo desactivar el rol.")
        }
        onHardDeleteChild={(r) =>
          roleCrud.onHardDelete(
            r,
            "No se pudo eliminar el rol (¿tiene usuarios asignados?).",
          )
        }
        onRestoreChild={(r) => roleCrud.onRestore(r, "No se pudo reactivar el rol.")}
        canDeleteChild={(r) => r.name !== PROTECTED_ROLE}
        onAfterChange={() => router.refresh()}
      />

      <EntityFormDialog
        open={deptCrud.modalState.open}
        onOpenChange={(open) => {
          if (!open) {
            deptCrud.closeModal();
            resetDeptForm();
          }
        }}
        title={
          deptCrud.modalState.editId === null ? "Nuevo departamento" : "Editar departamento"
        }
        busy={deptCrud.busy}
        error={deptCrud.error}
        onSubmit={onSubmitDept}
        onCancel={() => {
          deptCrud.closeModal();
          resetDeptForm();
        }}
        submitLabel={
          deptCrud.modalState.editId === null ? "Crear departamento" : "Guardar cambios"
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dept-name">Nombre *</Label>
            <Input
              id="dept-name"
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
              maxLength={160}
              disabled={deptCrud.busy}
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
        open={roleCrud.modalState.open}
        onOpenChange={(open) => {
          if (!open) {
            roleCrud.closeModal();
            resetRoleForm();
          }
        }}
        title={roleCrud.modalState.editId === null ? "Nuevo rol" : "Editar rol"}
        description={
          isEditingProtectedRole
            ? `El rol '${PROTECTED_ROLE}' no se puede renombrar ni desactivar; su departamento sí es editable.`
            : "Defina nombre, departamento y descripción del rol."
        }
        busy={roleCrud.busy}
        error={roleCrud.error}
        onSubmit={onSubmitRole}
        onCancel={() => {
          roleCrud.closeModal();
          resetRoleForm();
        }}
        submitLabel={roleCrud.modalState.editId === null ? "Crear rol" : "Guardar cambios"}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="role-name">Nombre *</Label>
            <Input
              id="role-name"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              maxLength={40}
              disabled={roleCrud.busy}
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
              disabled={roleCrud.busy}
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
