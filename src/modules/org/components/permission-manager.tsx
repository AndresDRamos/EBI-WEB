"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  KeyRound,
  ListTree,
  Pencil,
  Plus,
  Shield,
  Trash2,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
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
import { NavIcon, NAV_ICON_NAMES } from "@/modules/navigation/icons";
import { apiMutate } from "@/lib/api-client";

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

const ACTION_ORDER = ["view", "read", "list", "create", "update", "delete"];

interface MatrixRow {
  group: string;
  module: string;
  resource: string;
  byAction: Map<string, PermissionOption>;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

type DragScope = "sections" | `items:${number}` | `children:${number}`;

function reorder<T>(arr: T[], fromId: T, toId: T): T[] {
  const from = arr.indexOf(fromId);
  const to = arr.indexOf(toId);
  if (from === -1 || to === -1 || from === to) return arr;
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

/**
 * Unified permission manager (Permisos tab). One shared filter bar at the top
 * (mode Rol ⇄ Usuario) drives both panels through a single `roleId`: the
 * `module.resource:action` matrix (left) and the page-granular nav tree
 * (right). In Usuario mode the user's roles appear as chips → editing acts on
 * the chosen role (grants live on `auth.role`).
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
              <span className="text-xs text-muted-foreground">
                No hay usuarios. Créalos en Organización → Usuarios.
              </span>
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

// ---------------------------------------------------------------------------
// Left panel: permission matrix for the selected role (module.resource:action)
// ---------------------------------------------------------------------------

function PermissionsPanel({
  permissions,
  roleId,
  isAdminRole,
}: {
  permissions: PermissionOption[];
  roleId: number | null;
  isAdminRole: boolean;
}) {
  const [granted, setGranted] = React.useState<Set<number>>(new Set());
  // Modules start COLLAPSED by default (only expanded ones are tracked here).
  const [expandedModules, setExpandedModules] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (roleId === null || isAdminRole) {
        setGranted(new Set());
        return;
      }
      setLoading(true);
      setError(null);
      setDirty(false);
      setSaved(false);
      try {
        const res = await fetch(`/api/roles/${roleId}/permissions`);
        if (!res.ok) throw new Error();
        const d = (await res.json()) as { permission_ids?: number[] };
        if (cancelled) return;
        setGranted(new Set(d.permission_ids ?? []));
      } catch {
        if (!cancelled) setError("No se pudieron cargar los permisos del rol.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roleId, isAdminRole]);

  const { actions, modules } = React.useMemo(() => {
    const actionSet = new Set<string>();
    const rowsByGroup = new Map<string, MatrixRow>();
    for (const p of permissions) {
      const [group, action = ""] = p.code.split(":");
      if (!group || !action) continue;
      actionSet.add(action);
      const dot = group.indexOf(".");
      const moduleName = dot === -1 ? group : group.slice(0, dot);
      const resource = dot === -1 ? group : group.slice(dot + 1);
      const row = rowsByGroup.get(group) ?? {
        group,
        module: moduleName,
        resource,
        byAction: new Map<string, PermissionOption>(),
      };
      row.byAction.set(action, p);
      rowsByGroup.set(group, row);
    }
    const actions = [...actionSet].sort((a, b) => {
      const ia = ACTION_ORDER.indexOf(a);
      const ib = ACTION_ORDER.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
    const modules = new Map<string, MatrixRow[]>();
    for (const row of [...rowsByGroup.values()].sort((a, b) => a.group.localeCompare(b.group))) {
      const arr = modules.get(row.module) ?? [];
      arr.push(row);
      modules.set(row.module, arr);
    }
    return { actions, modules };
  }, [permissions]);

  function toggleModule(mod: string) {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod);
      else next.add(mod);
      return next;
    });
  }

  function toggleAction(permissionId: number) {
    setGranted((prev) => {
      const next = new Set(prev);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return next;
    });
    setDirty(true);
    setSaved(false);
  }

  async function onSave() {
    if (roleId === null) return;
    setBusy(true);
    setError(null);
    try {
      await apiMutate(`/api/roles/${roleId}/permissions`, {
        method: "PUT",
        body: { permission_ids: [...granted] },
        fallback: "No se pudieron guardar los permisos.",
      });
      setDirty(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="flex items-start gap-2.5 border-b p-4">
        <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-ezi-orange" />
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-tight">Control de permisos</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Qué acciones (`módulo.recurso:acción`) puede ejecutar el rol seleccionado.
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {roleId === null ? (
          <p className="p-4 text-sm text-muted-foreground">Selecciona un rol.</p>
        ) : isAdminRole ? (
          <div className="flex items-start gap-3 p-5">
            <Shield className="mt-0.5 h-[18px] w-[18px] shrink-0 text-ezi-orange" />
            <div>
              <p className="text-[13px] font-semibold">Acceso total</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                El rol <span className="font-mono font-semibold text-gray-700">admin</span> siempre
                tiene todos los permisos y ve todas las páginas. No se edita aquí; el servidor lo
                omite del catálogo.
              </p>
            </div>
          </div>
        ) : loading ? (
          <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
        ) : (
          [...modules.entries()].map(([moduleName, rows]) => {
            const expanded = expandedModules.has(moduleName);
            const total = rows.reduce((n, r) => n + r.byAction.size, 0);
            const grantedCount = rows.reduce(
              (n, r) => n + [...r.byAction.values()].filter((p) => granted.has(p.permission_id)).length,
              0,
            );
            return (
              <div key={moduleName}>
                <button
                  onClick={() => toggleModule(moduleName)}
                  className="sticky top-0 z-10 flex w-full items-center gap-2.5 border-y bg-gray-50 px-4 py-2 text-left hover:bg-gray-100"
                >
                  {expanded ? (
                    <ChevronDown className="h-[15px] w-[15px] shrink-0 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-[15px] w-[15px] shrink-0 text-gray-400" />
                  )}
                  <span className="flex-1 font-mono text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    {moduleName}
                  </span>
                  <span className="whitespace-nowrap text-[11px] text-gray-400">
                    {grantedCount}/{total} concedidos
                  </span>
                </button>
                {expanded
                  ? rows.map((row) => (
                      <div key={row.group} className="border-b p-3">
                        <div className="mb-2 flex items-baseline justify-between gap-3">
                          <div className="flex min-w-0 items-baseline gap-2">
                            <span className="font-mono text-[13px] font-semibold">{row.resource}</span>
                            <span className="font-mono text-[11px] text-gray-400">{row.group}</span>
                          </div>
                          <span className="whitespace-nowrap text-[11px] text-gray-500">
                            {[...row.byAction.values()].filter((p) => granted.has(p.permission_id)).length}/
                            {row.byAction.size}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {actions
                            .filter((a) => row.byAction.has(a))
                            .map((a) => {
                              const perm = row.byAction.get(a)!;
                              const on = granted.has(perm.permission_id);
                              return (
                                <button
                                  key={a}
                                  title={perm.description ?? perm.code}
                                  onClick={() => toggleAction(perm.permission_id)}
                                  disabled={busy}
                                  className={cn(
                                    "rounded-full border px-2.5 py-[5px] font-mono text-[11px] tracking-wide transition-colors",
                                    on
                                      ? "border-ezi-orange bg-ezi-orange font-semibold text-white"
                                      : "border-gray-300 bg-white text-gray-500 hover:border-gray-500 hover:text-gray-800",
                                  )}
                                >
                                  {a}
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    ))
                  : null}
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t p-3">
        <div className="min-h-[18px] text-xs">
          {error ? (
            <span className="text-destructive" role="alert">
              {error}
            </span>
          ) : dirty ? (
            <span className="text-warning">Cambios sin guardar</span>
          ) : saved ? (
            <span className="text-success">Permisos guardados.</span>
          ) : !isAdminRole && roleId !== null ? (
            <span className="text-muted-foreground">{granted.size} permisos concedidos a este rol</span>
          ) : null}
        </div>
        <Button onClick={() => void onSave()} disabled={busy || loading || isAdminRole || roleId === null}>
          {busy ? "Guardando…" : "Guardar permisos"}
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Right panel: page-granular nav access + order tree (role_nav_item, ADR 0008)
// ---------------------------------------------------------------------------

function NavAccessTree({
  sections,
  items,
  roleId,
  roleName,
  isAdminRole,
}: {
  sections: SectionRow[];
  items: ItemRow[];
  roleId: number | null;
  roleName: string | null;
  isAdminRole: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [expandedSectionId, setExpandedSectionId] = React.useState<number | null>(
    sections[0]?.section_id ?? null,
  );
  const [drag, setDrag] = React.useState<{ scope: DragScope; id: number } | null>(null);

  // Per-page visibility for the role (item_id -> priority). Presence = visible.
  const [itemGrants, setItemGrants] = React.useState<Map<number, number>>(new Map());
  // Per-role section order (topbar priority) as an ordered list of section ids.
  const [sectionOrder, setSectionOrder] = React.useState<number[]>(() =>
    [...sections].sort((a, b) => a.sort_order - b.sort_order).map((s) => s.section_id),
  );
  // Display/drag order of items (all items, visible-first), per section / parent.
  const [itemsBySection, setItemsBySection] = React.useState<Map<number, number[]>>(new Map());
  const [childrenByItem, setChildrenByItem] = React.useState<Map<number, number[]>>(new Map());

  const itemsById = React.useMemo(() => new Map(items.map((i) => [i.item_id, i])), [items]);
  const sectionsById = React.useMemo(
    () => new Map(sections.map((s) => [s.section_id, s])),
    [sections],
  );

  const topItemsRaw = React.useMemo(
    () => items.filter((i) => i.parent_item_id === null),
    [items],
  );
  const childItemsRaw = React.useMemo(
    () => items.filter((i) => i.parent_item_id !== null),
    [items],
  );

  // Build the display order maps from the loaded grants: visible items first
  // (by their per-role priority), hidden items after (by global sort_order).
  const buildOrder = React.useCallback(
    (grants: Map<number, number>) => {
      const rank = (id: number) => {
        const p = grants.get(id);
        const it = itemsById.get(id)!;
        return p !== undefined ? p : 1_000_000 + it.sort_order;
      };
      const bySection = new Map<number, number[]>();
      for (const s of sections) {
        const ids = topItemsRaw
          .filter((i) => i.section_id === s.section_id)
          .map((i) => i.item_id)
          .sort((a, b) => rank(a) - rank(b));
        bySection.set(s.section_id, ids);
      }
      const byParent = new Map<number, number[]>();
      for (const parent of topItemsRaw) {
        const ids = childItemsRaw
          .filter((c) => c.parent_item_id === parent.item_id)
          .map((c) => c.item_id)
          .sort((a, b) => rank(a) - rank(b));
        if (ids.length > 0) byParent.set(parent.item_id, ids);
      }
      return { bySection, byParent };
    },
    [sections, topItemsRaw, childItemsRaw, itemsById],
  );

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const defaultOrder = () => {
        const { bySection, byParent } = buildOrder(new Map());
        setItemsBySection(bySection);
        setChildrenByItem(byParent);
        setSectionOrder([...sections].sort((a, b) => a.sort_order - b.sort_order).map((s) => s.section_id));
      };
      if (roleId === null || isAdminRole) {
        setItemGrants(new Map());
        defaultOrder();
        return;
      }
      setLoading(true);
      setError(null);
      setDirty(false);
      setSaved(false);
      try {
        const [itemsRes, sectionsRes] = await Promise.all([
          fetch(`/api/roles/${roleId}/items`),
          fetch(`/api/roles/${roleId}/sections`),
        ]);
        if (!itemsRes.ok || !sectionsRes.ok) throw new Error();
        const itemsData = (await itemsRes.json()) as { grants?: { item_id: number; priority: number }[] };
        const sectionsData = (await sectionsRes.json()) as {
          grants?: { section_id: number; priority: number }[];
        };
        if (cancelled) return;
        const grants = new Map((itemsData.grants ?? []).map((g) => [g.item_id, g.priority]));
        const secPrio = new Map((sectionsData.grants ?? []).map((g) => [g.section_id, g.priority]));
        setItemGrants(grants);
        const { bySection, byParent } = buildOrder(grants);
        setItemsBySection(bySection);
        setChildrenByItem(byParent);
        setSectionOrder(
          [...sections]
            .sort((a, b) => {
              const pa = secPrio.get(a.section_id);
              const pb = secPrio.get(b.section_id);
              if (pa !== undefined && pb !== undefined) return pa - pb;
              if (pa !== undefined) return -1;
              if (pb !== undefined) return 1;
              return a.sort_order - b.sort_order;
            })
            .map((s) => s.section_id),
        );
      } catch {
        if (!cancelled) setError("No se pudo cargar la visibilidad del rol.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleId, isAdminRole]);

  // A page is visible if it's granted (admin sees everything).
  const isItemVisible = React.useCallback(
    (itemId: number) => isAdminRole || itemGrants.has(itemId),
    [isAdminRole, itemGrants],
  );

  // A section is DERIVED-visible: ≥1 of its (active) pages is visible.
  const sectionItemIds = React.useMemo(() => {
    const map = new Map<number, number[]>();
    for (const it of items) {
      const arr = map.get(it.section_id) ?? [];
      arr.push(it.item_id);
      map.set(it.section_id, arr);
    }
    return map;
  }, [items]);

  const isSectionVisible = React.useCallback(
    (sectionId: number) =>
      isAdminRole || (sectionItemIds.get(sectionId) ?? []).some((id) => itemGrants.has(id)),
    [isAdminRole, itemGrants, sectionItemIds],
  );

  // Display order of sections: visible first (in sectionOrder), ungranted last.
  const displaySectionOrder = React.useMemo(() => {
    return [...sectionOrder].sort((a, b) => {
      const va = isSectionVisible(a) ? 0 : 1;
      const vb = isSectionVisible(b) ? 0 : 1;
      if (va !== vb) return va - vb;
      return sectionOrder.indexOf(a) - sectionOrder.indexOf(b);
    });
  }, [sectionOrder, isSectionVisible]);

  function markDirty() {
    setDirty(true);
    setSaved(false);
  }

  function toggleItemVisible(itemId: number) {
    if (isAdminRole) return;
    setItemGrants((prev) => {
      const next = new Map(prev);
      if (next.has(itemId)) next.delete(itemId);
      else {
        // Append after the currently-highest priority so new grants sort last.
        const max = next.size === 0 ? -10 : Math.max(...next.values());
        next.set(itemId, max + 10);
      }
      return next;
    });
    markDirty();
  }

  // Toggle a whole section = grant/revoke ALL its pages for the role.
  function toggleSectionVisible(sectionId: number) {
    if (isAdminRole) return;
    const ids = sectionItemIds.get(sectionId) ?? [];
    const anyVisible = ids.some((id) => itemGrants.has(id));
    setItemGrants((prev) => {
      const next = new Map(prev);
      if (anyVisible) {
        for (const id of ids) next.delete(id);
      } else {
        let max = next.size === 0 ? -10 : Math.max(...next.values());
        // Preserve the section's display order when bulk-granting (top items
        // interleaved with their children), falling back to raw id order.
        const idSet = new Set(ids);
        const ordered: number[] = [];
        for (const topId of itemsBySection.get(sectionId) ?? []) {
          if (idSet.has(topId)) ordered.push(topId);
          for (const childId of childrenByItem.get(topId) ?? []) {
            if (idSet.has(childId)) ordered.push(childId);
          }
        }
        for (const id of ordered.length ? ordered : ids) {
          max += 10;
          next.set(id, max);
        }
      }
      return next;
    });
    markDirty();
  }

  function onDragStart(scope: DragScope, id: number) {
    setDrag({ scope, id });
  }
  function onDragOverRow(scope: DragScope, id: number) {
    if (!drag || drag.scope !== scope || drag.id === id) return;
    if (scope === "sections") {
      setSectionOrder((prev) => reorder(prev, drag.id, id));
    } else if (scope.startsWith("items:")) {
      const sectionId = Number(scope.slice(6));
      setItemsBySection((prev) => {
        const next = new Map(prev);
        next.set(sectionId, reorder(next.get(sectionId) ?? [], drag.id, id));
        return next;
      });
    } else {
      const itemId = Number(scope.slice(9));
      setChildrenByItem((prev) => {
        const next = new Map(prev);
        next.set(itemId, reorder(next.get(itemId) ?? [], drag.id, id));
        return next;
      });
    }
    markDirty();
  }
  function onDragEndRow() {
    setDrag(null);
  }

  async function onSave() {
    if (roleId === null || isAdminRole) return;
    setBusy(true);
    setError(null);
    try {
      // Page grants: for each visible item, priority = its rank in the display
      // order (top items then their children), so per-role order round-trips.
      const grants: { item_id: number; priority: number }[] = [];
      let seq = 0;
      for (const sectionId of sectionOrder) {
        for (const topId of itemsBySection.get(sectionId) ?? []) {
          if (itemGrants.has(topId)) grants.push({ item_id: topId, priority: seq++ * 10 });
          for (const childId of childrenByItem.get(topId) ?? []) {
            if (itemGrants.has(childId)) grants.push({ item_id: childId, priority: seq++ * 10 });
          }
        }
      }
      // Section order: only granted (derived-visible) sections, in display order.
      const sectionGrants = displaySectionOrder
        .filter((id) => isSectionVisible(id))
        .map((id, idx) => ({ section_id: id, priority: idx * 10 }));

      await Promise.all([
        apiMutate(`/api/roles/${roleId}/items`, {
          method: "PUT",
          body: { grants },
          fallback: "No se pudo guardar el acceso/orden.",
        }),
        apiMutate(`/api/roles/${roleId}/sections`, {
          method: "PUT",
          body: { grants: sectionGrants },
          fallback: "No se pudo guardar el acceso/orden.",
        }),
      ]);
      setDirty(false);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  const [sectionDialogId, setSectionDialogId] = React.useState<number | null>(null);
  const [itemDialog, setItemDialog] = React.useState<{
    sectionId: number;
    parentItemId: number | null;
    editId: number | null;
  } | null>(null);
  const [deleteItemId, setDeleteItemId] = React.useState<number | null>(null);

  const visibleSectionCount = displaySectionOrder.filter((id) => isSectionVisible(id)).length;

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="flex items-start gap-2.5 border-b p-4">
        <ListTree className="mt-0.5 h-5 w-5 shrink-0 text-ezi-orange" />
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-tight">Estructura del menú</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Qué páginas ve el rol y en qué orden. Una sección sin páginas visibles se manda al
            final.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 border-b bg-gray-50 px-4 py-2 text-[11.5px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-ezi-orange" />
          Página visible
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-gray-300 opacity-50" />
          Oculta para este rol
        </span>
        <span className="ml-auto font-mono">
          {roleId === null
            ? "—"
            : isAdminRole
              ? `admin · ve ${sections.length} secciones`
              : `${roleName ?? ""} · ve ${visibleSectionCount}/${sections.length} secciones`}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
        ) : (
          displaySectionOrder.map((sectionId) => {
            const section = sectionsById.get(sectionId);
            if (!section) return null;
            const sectionVisible = isSectionVisible(sectionId);
            const expanded = expandedSectionId === sectionId;
            const topItems = itemsBySection.get(sectionId) ?? [];
            return (
              <div key={sectionId}>
                <div
                  draggable={!isAdminRole}
                  onDragStart={() => onDragStart("sections", sectionId)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    onDragOverRow("sections", sectionId);
                  }}
                  onDrop={(e) => e.preventDefault()}
                  onDragEnd={onDragEndRow}
                  className={cn(
                    "flex items-center gap-2.5 border-b px-3.5 py-2.5",
                    expanded ? "bg-gray-50" : "bg-white",
                    !sectionVisible && "opacity-[0.42]",
                  )}
                >
                  {!isAdminRole ? (
                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-300" />
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}
                  <button
                    onClick={() => setExpandedSectionId(expanded ? null : sectionId)}
                    className="flex shrink-0 items-center justify-center rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                    aria-label="Expandir"
                  >
                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <NavIcon name={section.icon} className="h-[18px] w-[18px] shrink-0 text-ezi-orange" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold leading-tight">{section.label}</div>
                    <div className="font-mono text-[11px] text-gray-400">{section.base_path}</div>
                  </div>
                  {sectionVisible ? (
                    <Badge variant="muted" className="whitespace-nowrap font-mono text-[11px] font-semibold">
                      P{displaySectionOrder.filter((id) => isSectionVisible(id)).indexOf(sectionId) + 1}
                    </Badge>
                  ) : null}
                  <button
                    onClick={() => setSectionDialogId(sectionId)}
                    className="flex shrink-0 items-center justify-center rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-800"
                    aria-label={`Editar ${section.label}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {isAdminRole ? (
                    <Eye className="h-[15px] w-[15px] shrink-0 text-gray-300" />
                  ) : (
                    <button
                      onClick={() => toggleSectionVisible(sectionId)}
                      className="flex shrink-0 items-center"
                      aria-label={sectionVisible ? "Ocultar toda la sección" : "Mostrar toda la sección"}
                      title={sectionVisible ? "Ocultar todas las páginas" : "Mostrar todas las páginas"}
                    >
                      {sectionVisible ? (
                        <Eye className="h-[15px] w-[15px] text-gray-300" />
                      ) : (
                        <EyeOff className="h-[15px] w-[15px] text-ezi-orange" />
                      )}
                    </button>
                  )}
                </div>

                {expanded ? (
                  <div className="border-b bg-gray-50">
                    {topItems.length === 0 ? (
                      <p className="py-3 pl-[46px] pr-3.5 text-xs italic text-gray-400">
                        Sin páginas de sidebar en esta sección.
                      </p>
                    ) : (
                      topItems.map((itemId) => {
                        const item = itemsById.get(itemId);
                        if (!item) return null;
                        const children = childrenByItem.get(itemId) ?? [];
                        const itemVisible = isItemVisible(itemId);
                        return (
                          <div key={itemId}>
                            <div
                              draggable
                              onDragStart={() => onDragStart(`items:${sectionId}`, itemId)}
                              onDragOver={(e) => {
                                e.preventDefault();
                                onDragOverRow(`items:${sectionId}`, itemId);
                              }}
                              onDrop={(e) => e.preventDefault()}
                              onDragEnd={onDragEndRow}
                              className={cn(
                                "flex items-center gap-2 border-t py-2 pl-[46px] pr-3.5",
                                !itemVisible && "opacity-[0.45]",
                              )}
                            >
                              <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-gray-300" />
                              <NavIcon name={item.icon} className="h-4 w-4 shrink-0 text-gray-500" />
                              <div className="min-w-0 flex-1">
                                <div className="text-[13px] font-medium leading-tight text-gray-800">
                                  {item.label}
                                </div>
                                <div className="font-mono text-[10.5px] text-gray-400">{item.href}</div>
                              </div>
                              {!isAdminRole ? (
                                <button
                                  onClick={() => toggleItemVisible(itemId)}
                                  className="flex shrink-0 items-center"
                                  aria-label={itemVisible ? "Ocultar página" : "Mostrar página"}
                                  title={itemVisible ? "Ocultar página" : "Mostrar página"}
                                >
                                  {itemVisible ? (
                                    <Eye className="h-[15px] w-[15px] text-gray-300" />
                                  ) : (
                                    <EyeOff className="h-[15px] w-[15px] text-ezi-orange" />
                                  )}
                                </button>
                              ) : null}
                              <button
                                onClick={() => setItemDialog({ sectionId, parentItemId: null, editId: itemId })}
                                className="flex shrink-0 items-center justify-center rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-800"
                                aria-label={`Editar ${item.label}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setItemDialog({ sectionId, parentItemId: itemId, editId: null })}
                                className="flex shrink-0 items-center justify-center rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-800"
                                aria-label={`Agregar hijo de ${item.label}`}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteItemId(itemId)}
                                className="flex shrink-0 items-center justify-center rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-destructive"
                                aria-label={`Eliminar ${item.label}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {children.map((childId) => {
                              const child = itemsById.get(childId);
                              if (!child) return null;
                              const childVisible = isItemVisible(childId);
                              return (
                                <div
                                  key={childId}
                                  draggable
                                  onDragStart={() => onDragStart(`children:${itemId}`, childId)}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    onDragOverRow(`children:${itemId}`, childId);
                                  }}
                                  onDrop={(e) => e.preventDefault()}
                                  onDragEnd={onDragEndRow}
                                  className={cn(
                                    "flex items-center gap-2 border-t py-1.5 pl-[72px] pr-3.5",
                                    !childVisible && "opacity-[0.45]",
                                  )}
                                >
                                  <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-gray-300" />
                                  <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-gray-300" />
                                  <span className="min-w-0 flex-1 text-[12.5px] text-gray-700">
                                    {child.label}
                                  </span>
                                  {!isAdminRole ? (
                                    <button
                                      onClick={() => toggleItemVisible(childId)}
                                      className="flex shrink-0 items-center"
                                      aria-label={childVisible ? "Ocultar página" : "Mostrar página"}
                                      title={childVisible ? "Ocultar página" : "Mostrar página"}
                                    >
                                      {childVisible ? (
                                        <Eye className="h-[14px] w-[14px] text-gray-300" />
                                      ) : (
                                        <EyeOff className="h-[14px] w-[14px] text-ezi-orange" />
                                      )}
                                    </button>
                                  ) : null}
                                  <button
                                    onClick={() =>
                                      setItemDialog({ sectionId, parentItemId: itemId, editId: childId })
                                    }
                                    className="flex shrink-0 items-center justify-center rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-800"
                                    aria-label={`Editar ${child.label}`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteItemId(childId)}
                                    className="flex shrink-0 items-center justify-center rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-destructive"
                                    aria-label={`Eliminar ${child.label}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })
                    )}
                    <div className="py-2 pl-[46px] pr-3.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setItemDialog({ sectionId, parentItemId: null, editId: null })}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Nueva página
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t p-3">
        <div className="min-h-[18px] text-xs">
          {error ? (
            <span className="text-destructive" role="alert">
              {error}
            </span>
          ) : dirty ? (
            <span className="text-warning">Cambios sin guardar</span>
          ) : saved ? (
            <span className="text-success">Visibilidad y orden guardados.</span>
          ) : (
            <span className="text-muted-foreground">
              Oculta páginas o secciones; sin páginas visibles, la sección se manda al final.
            </span>
          )}
        </div>
        <Button variant="outline" onClick={() => void onSave()} disabled={busy || loading || isAdminRole}>
          {busy ? "Guardando…" : "Guardar visibilidad y orden"}
        </Button>
      </div>

      {sectionDialogId !== null ? (
        <SectionEditDialog
          section={sectionsById.get(sectionDialogId) ?? null}
          onOpenChange={(open) => !open && setSectionDialogId(null)}
          onSaved={() => {
            setSectionDialogId(null);
            router.refresh();
          }}
        />
      ) : null}

      {itemDialog ? (
        <ItemEditDialog
          sectionId={itemDialog.sectionId}
          section={sectionsById.get(itemDialog.sectionId) ?? null}
          parentItemId={itemDialog.parentItemId}
          topLevelItems={(itemsBySection.get(itemDialog.sectionId) ?? [])
            .map((id) => itemsById.get(id))
            .filter((i): i is ItemRow => Boolean(i))}
          item={itemDialog.editId !== null ? (itemsById.get(itemDialog.editId) ?? null) : null}
          onOpenChange={(open) => !open && setItemDialog(null)}
          onSaved={() => {
            setItemDialog(null);
            router.refresh();
          }}
        />
      ) : null}

      <AlertDialog open={deleteItemId !== null} onOpenChange={(open) => !open && setDeleteItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar página</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará
              {deleteItemId !== null ? ` "${itemsById.get(deleteItemId)?.label ?? ""}"` : ""} del menú.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteItemId === null) return;
                await fetch(`/api/nav/items/${deleteItemId}`, { method: "DELETE" });
                setDeleteItemId(null);
                router.refresh();
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Structure CRUD dialogs (inline replacement for the retired Módulos tab)
// ---------------------------------------------------------------------------

function IconPickerField({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Ícono</Label>
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-gray-50 text-ezi-orange">
          <NavIcon name={value || null} className="h-5 w-5" />
        </span>
        <Select
          id={id}
          className="flex-1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          <option value="">Sin ícono</option>
          {NAV_ICON_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

function SectionEditDialog({
  section,
  onOpenChange,
  onSaved,
}: {
  section: SectionRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = React.useState(section?.label ?? "");
  const [icon, setIcon] = React.useState(section?.icon ?? "");
  const [sortOrder, setSortOrder] = React.useState(String(section?.sort_order ?? 0));
  const [isActive, setIsActive] = React.useState(section?.is_active ?? true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit() {
    if (!section) return;
    if (!label.trim()) {
      setError("La etiqueta es obligatoria.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiMutate(`/api/nav/sections/${section.section_id}`, {
        method: "PUT",
        body: {
          label: label.trim(),
          icon: icon || null,
          sort_order: Number(sortOrder) || 0,
          is_active: isActive,
        },
        fallback: "No se pudo guardar la sección.",
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <EntityFormDialog
      open={section !== null}
      onOpenChange={onOpenChange}
      title="Editar sección"
      description="La ruta base no es editable: la define el código del módulo."
      busy={busy}
      error={error}
      onSubmit={onSubmit}
      onCancel={() => onOpenChange(false)}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="tree-section-label">Etiqueta *</Label>
          <Input id="tree-section-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} disabled={busy} />
        </div>
        <IconPickerField id="tree-section-icon" value={icon} onChange={setIcon} disabled={busy} />
        <div className="space-y-2">
          <Label htmlFor="tree-section-order">Orden global (empate de prioridad)</Label>
          <Input
            id="tree-section-order"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="tree-section-active" checked={isActive} onCheckedChange={(c) => setIsActive(Boolean(c))} disabled={busy} />
          <Label htmlFor="tree-section-active">Activa</Label>
        </div>
      </div>
    </EntityFormDialog>
  );
}

function ItemEditDialog({
  sectionId,
  section,
  parentItemId,
  topLevelItems,
  item,
  onOpenChange,
  onSaved,
}: {
  sectionId: number;
  section: SectionRow | null;
  parentItemId: number | null;
  topLevelItems: ItemRow[];
  item: ItemRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = React.useState(item?.label ?? "");
  const [icon, setIcon] = React.useState(item?.icon ?? "");
  const [href, setHref] = React.useState(item?.href ?? (section ? `${section.base_path}/` : ""));
  const [isActive, setIsActive] = React.useState(item?.is_active ?? true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isChildCreate = item === null && parentItemId !== null;

  async function onSubmit() {
    if (!label.trim() || !href.trim()) {
      setError("Etiqueta y ruta son obligatorias.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const url = item ? `/api/nav/items/${item.item_id}` : "/api/nav/items";
      const method = item ? "PUT" : "POST";
      const body: Record<string, unknown> = {
        label: label.trim(),
        icon: icon || null,
        href: href.trim(),
      };
      if (!item) {
        body.section_id = sectionId;
        body.parent_item_id = parentItemId;
        body.sort_order = (topLevelItems.length + 1) * 10;
      } else {
        body.is_active = isActive;
      }
      await apiMutate(url, { method, body, fallback: "No se pudo guardar la página." });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <EntityFormDialog
      open
      onOpenChange={onOpenChange}
      title={item ? "Editar página" : isChildCreate ? "Nueva sub-página" : "Nueva página"}
      busy={busy}
      error={error}
      onSubmit={onSubmit}
      onCancel={() => onOpenChange(false)}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="tree-item-label">Etiqueta *</Label>
          <Input id="tree-item-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} disabled={busy} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tree-item-href">Ruta *</Label>
          <Input
            id="tree-item-href"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            maxLength={200}
            disabled={busy}
            placeholder={section ? `${section.base_path}/...` : undefined}
          />
        </div>
        <IconPickerField id="tree-item-icon" value={icon} onChange={setIcon} disabled={busy} />
        {item ? (
          <div className="flex items-center gap-2">
            <Checkbox id="tree-item-active" checked={isActive} onCheckedChange={(c) => setIsActive(Boolean(c))} disabled={busy} />
            <Label htmlFor="tree-item-active">Activo</Label>
          </div>
        ) : null}
      </div>
    </EntityFormDialog>
  );
}
