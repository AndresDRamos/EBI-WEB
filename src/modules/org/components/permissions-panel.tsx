"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, KeyRound, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/kit/section-header";
import { apiMutate } from "@/lib/api-client";
import type { PermissionOption } from "@/modules/org/components/permission-manager";

const ACTION_ORDER = ["view", "read", "list", "create", "update", "delete"];

interface MatrixRow {
  group: string;
  module: string;
  resource: string;
  byAction: Map<string, PermissionOption>;
}

// ---------------------------------------------------------------------------
// Left panel: permission matrix for the selected role (module.resource:action)
// ---------------------------------------------------------------------------

export function PermissionsPanel({
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
      <SectionHeader
        variant="panel"
        icon={KeyRound}
        title="Control de permisos"
        description="Qué acciones (`módulo.recurso:acción`) puede ejecutar el rol seleccionado."
      />

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
