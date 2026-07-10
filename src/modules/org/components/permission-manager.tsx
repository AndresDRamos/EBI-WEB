"use client";

import * as React from "react";
import { Shield, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/kit/empty-state";
import { PermissionsPanel } from "@/modules/org/components/permissions-panel";
import { NavAccessTree } from "@/modules/org/components/nav-access-tree";

export interface PermissionOption {
  permission_id: number;
  code: string;
  description: string | null;
}

export interface RoleOption {
  role_id: number;
  name: string;
}

export interface UserOption {
  user_id: number;
  username: string;
  display_name: string | null;
  roles: RoleOption[];
}

export interface SectionRow {
  section_id: number;
  code: string;
  label: string;
  icon: string | null;
  base_path: string;
  sort_order: number;
  is_active: boolean;
}

export interface ItemRow {
  item_id: number;
  section_id: number;
  parent_item_id: number | null;
  label: string;
  icon: string | null;
  href: string;
  sort_order: number;
  is_active: boolean;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Unified permission manager (Permisos tab). One shared filter bar at the top
 * (mode Rol ⇄ Usuario) drives both panels through a single `roleId`: the
 * `module.resource:action` matrix (left, `permissions-panel.tsx`) and the
 * page-granular nav tree (right, `nav-access-tree.tsx`). In Usuario mode the
 * user's roles appear as chips → editing acts on the chosen role (grants live
 * on `auth.role`).
 *
 * Nav authority is per PAGE (ADR 0008, `role_nav_item`): the tree toggles each
 * page's visibility for the role and drag-orders pages within their section
 * (per-role `priority`); a section is DERIVED-visible (≥1 visible page) and
 * sinks to the end when it has none. Section drag order edits the per-role
 * `role_nav_section.priority` (topbar order only). The protected `admin` role
 * bypasses everywhere: no grant rows, sees every page, shows "Acceso total".
 */
export function PermissionManager({
  roles,
  users,
  permissions,
  sections,
  items,
}: {
  roles: RoleOption[];
  users: UserOption[];
  permissions: PermissionOption[];
  sections: SectionRow[];
  items: ItemRow[];
}) {
  const adminRole = roles.find((r) => r.name === "admin") ?? null;
  const firstNonAdmin = roles.find((r) => r.name !== "admin") ?? roles[0] ?? null;

  const [mode, setMode] = React.useState<"role" | "user">("role");
  const [selectedUserId, setSelectedUserId] = React.useState<number | null>(
    users[0]?.user_id ?? null,
  );
  const [roleId, setRoleId] = React.useState<number | null>(firstNonAdmin?.role_id ?? null);

  const selectedUser = users.find((u) => u.user_id === selectedUserId) ?? null;
  const isAdminRole = roleId !== null && roleId === adminRole?.role_id;
  const roleName = roles.find((r) => r.role_id === roleId)?.name ?? null;

  function onUserChange(id: number) {
    setSelectedUserId(id);
    const user = users.find((u) => u.user_id === id);
    if (user?.roles[0]) setRoleId(user.roles[0].role_id);
  }

  function onModeChange(next: "role" | "user") {
    setMode(next);
    if (next === "user" && selectedUser?.roles[0]) setRoleId(selectedUser.roles[0].role_id);
    if (next === "role" && roleId === null) setRoleId(firstNonAdmin?.role_id ?? null);
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col gap-4">
      <FilterBar
        mode={mode}
        onModeChange={onModeChange}
        roles={roles}
        roleId={roleId}
        onRoleChange={setRoleId}
        roleName={roleName}
        users={users}
        selectedUser={selectedUser}
        onUserChange={onUserChange}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <PermissionsPanel permissions={permissions} roleId={roleId} isAdminRole={isAdminRole} />
        <NavAccessTree
          sections={sections}
          items={items}
          roleId={roleId}
          roleName={roleName}
          isAdminRole={isAdminRole}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared top filter bar: mode Rol ⇄ Usuario, driving a single roleId.
// ---------------------------------------------------------------------------

function FilterBar({
  mode,
  onModeChange,
  roles,
  roleId,
  onRoleChange,
  roleName,
  users,
  selectedUser,
  onUserChange,
}: {
  mode: "role" | "user";
  onModeChange: (m: "role" | "user") => void;
  roles: RoleOption[];
  roleId: number | null;
  onRoleChange: (id: number) => void;
  roleName: string | null;
  users: UserOption[];
  selectedUser: UserOption | null;
  onUserChange: (id: number) => void;
}) {
  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-0.5 rounded-md border bg-gray-50 p-0.5">
        <ModeButton active={mode === "role"} onClick={() => onModeChange("role")} icon={<Shield className="h-3.5 w-3.5" />}>
          Por rol
        </ModeButton>
        <ModeButton active={mode === "user"} onClick={() => onModeChange("user")} icon={<UserRound className="h-3.5 w-3.5" />}>
          Por usuario
        </ModeButton>
      </div>

      {mode === "role" ? (
        <div className="flex items-center gap-2">
          <Label className="text-xs font-semibold text-gray-600">Rol</Label>
          <Select
            className="h-[34px] min-w-[180px] text-sm"
            value={roleId ?? ""}
            onChange={(e) => onRoleChange(Number(e.target.value))}
          >
            {roles.map((r) => (
              <option key={r.role_id} value={r.role_id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-semibold text-gray-600">Usuario</Label>
            {users.length === 0 ? (
              <EmptyState
                variant="inline"
                className="text-xs"
                title="No hay usuarios. Créalos en Organización → Usuarios."
              />
            ) : (
              <>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ezi-gray text-[10px] font-bold text-white">
                  {initialsOf(selectedUser?.display_name ?? selectedUser?.username ?? "?")}
                </span>
                <Select
                  className="h-[34px] min-w-[180px] text-sm"
                  value={selectedUser?.user_id ?? ""}
                  onChange={(e) => onUserChange(Number(e.target.value))}
                >
                  {users.map((u) => (
                    <option key={u.user_id} value={u.user_id}>
                      {u.display_name ?? u.username}
                    </option>
                  ))}
                </Select>
              </>
            )}
          </div>
          {selectedUser ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-gray-400">roles:</span>
              {selectedUser.roles.length === 0 ? (
                <span className="text-xs text-muted-foreground">Sin roles asignados.</span>
              ) : (
                selectedUser.roles.map((r) => {
                  const sel = r.role_id === roleId;
                  return (
                    <button
                      key={r.role_id}
                      onClick={() => onRoleChange(r.role_id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs transition-colors",
                        sel
                          ? "border-ezi-gray bg-ezi-gray text-white"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-400",
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", sel ? "bg-ezi-orange" : "bg-gray-300")} />
                      {r.name}
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
      )}

      <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
        Editando el rol{" "}
        <span className="font-mono font-semibold text-gray-700">{roleName ?? "—"}</span>
      </span>
    </section>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-white text-ezi-gray shadow-sm" : "text-gray-500 hover:text-gray-800",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
