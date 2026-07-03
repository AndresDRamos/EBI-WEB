"use client";

import * as React from "react";
import { Copy, KeyRound } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface PermissionOption {
  permission_id: number;
  code: string;
  description: string | null;
}

export interface ProfileOption {
  role_id: number;
  name: string;
}

/** Canonical column order; actions outside this list go after, alphabetically. */
const ACTION_ORDER = ["view", "read", "list", "create", "update", "delete"];

interface MatrixRow {
  /** `module.resource` — everything before the `:action`. */
  group: string;
  module: string;
  resource: string;
  /** action → permission (only for codes that exist in the catalog). */
  byAction: Map<string, PermissionOption>;
}

/**
 * Permission matrix per access profile: rows = `module.resource` (grouped by
 * module), columns = the union of catalog actions, one checkbox per existing
 * code — the whole grant state visible at a glance, no dropdowns. The catalog
 * is migration-seeded and read-only here; saving replaces the profile's grant
 * set (same API as the retired list panel). "Copiar de otro perfil" loads the
 * source profile's grants into local state; nothing persists until Guardar.
 * The protected `admin` profile bypasses at the app layer and is excluded.
 */
export function PermissionMatrixPanel({
  profiles,
  permissions,
}: {
  profiles: ProfileOption[];
  permissions: PermissionOption[];
}) {
  const nonAdminProfiles = profiles.filter((p) => p.name !== "admin");
  const [roleId, setRoleId] = React.useState<number | null>(
    nonAdminProfiles[0]?.role_id ?? null,
  );
  const [granted, setGranted] = React.useState<Set<number>>(new Set());
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [copyFromId, setCopyFromId] = React.useState<string>("");

  React.useEffect(() => {
    if (roleId === null) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      setNotice(null);
      try {
        const res = await fetch(`/api/roles/${roleId}/permissions`);
        const d = (await res.json()) as { permission_ids?: number[] };
        if (cancelled) return;
        setGranted(new Set(d.permission_ids ?? []));
      } catch {
        if (!cancelled) setError("No se pudieron cargar los permisos del perfil.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roleId]);

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
    for (const row of [...rowsByGroup.values()].sort((a, b) =>
      a.group.localeCompare(b.group),
    )) {
      const arr = modules.get(row.module) ?? [];
      arr.push(row);
      modules.set(row.module, arr);
    }
    return { actions, modules };
  }, [permissions]);

  function toggle(permissionId: number, checked: boolean) {
    setNotice(null);
    setGranted((prev) => {
      const next = new Set(prev);
      if (checked) next.add(permissionId);
      else next.delete(permissionId);
      return next;
    });
  }

  async function onCopyFrom() {
    const sourceId = Number(copyFromId);
    if (!sourceId) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/roles/${sourceId}/permissions`);
      if (!res.ok) throw new Error();
      const d = (await res.json()) as { permission_ids?: number[] };
      setGranted(new Set(d.permission_ids ?? []));
      const source = nonAdminProfiles.find((p) => p.role_id === sourceId);
      setNotice(
        `Permisos copiados de '${source?.name ?? sourceId}'. Guarda para aplicarlos.`,
      );
    } catch {
      setError("No se pudieron copiar los permisos del perfil origen.");
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (roleId === null) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/roles/${roleId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permission_ids: [...granted] }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudieron guardar los permisos.");
      }
      setNotice("Permisos guardados.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  const copySources = nonAdminProfiles.filter((p) => p.role_id !== roleId);

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="flex items-center gap-3">
          <KeyRound className="h-5 w-5 text-ezi-orange" />
          <div>
            <h2 className="font-semibold leading-tight">Permisos por rol</h2>
            <p className="text-xs text-muted-foreground">
              Qué acciones puede ejecutar cada rol. El catálogo lo siembran las
              migraciones; el servidor re-verifica cada permiso en cada request.
              El rol <span className="font-medium">admin</span> siempre tiene
              acceso total y no aparece aquí.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="matrix-profile" className="shrink-0">
            Rol
          </Label>
          <Select
            id="matrix-profile"
            className="max-w-48"
            value={roleId ?? ""}
            onChange={(e) => setRoleId(Number(e.target.value))}
          >
            {nonAdminProfiles.map((p) => (
              <option key={p.role_id} value={p.role_id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select
            id="matrix-copy-source"
            className="max-w-48"
            value={copyFromId}
            onChange={(e) => setCopyFromId(e.target.value)}
            disabled={busy || loading || copySources.length === 0}
            aria-label="Perfil origen para copiar permisos"
          >
            <option value="">Copiar de otro rol…</option>
            {copySources.map((p) => (
              <option key={p.role_id} value={p.role_id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onCopyFrom()}
            disabled={busy || loading || copyFromId === ""}
          >
            <Copy className="h-3.5 w-3.5" />
            Copiar
          </Button>
        </div>
      </div>

      {nonAdminProfiles.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          No hay roles. Créalos en Organización → Departamentos y roles.
        </p>
      ) : loading ? (
        <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <div className="max-h-[calc(100vh-18rem)] overflow-auto">
          <Table className="table-fixed">
            <TableHeader className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_var(--border)]">
              <TableRow>
                <TableHead className="w-64 text-xs font-semibold uppercase tracking-wide">
                  Recurso
                </TableHead>
                {actions.map((a) => (
                  <TableHead
                    key={a}
                    className="w-24 text-center font-mono text-xs font-semibold"
                  >
                    {a}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...modules.entries()].map(([moduleName, rows]) => (
                <React.Fragment key={moduleName}>
                  <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                    <TableCell
                      colSpan={actions.length + 1}
                      className="py-1.5 font-mono text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {moduleName}
                    </TableCell>
                  </TableRow>
                  {rows.map((row) => (
                    <TableRow key={row.group}>
                      <TableCell className="font-mono text-xs">{row.resource}</TableCell>
                      {actions.map((a) => {
                        const perm = row.byAction.get(a);
                        return (
                          <TableCell key={a} className="text-center">
                            {perm ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex">
                                    <Checkbox
                                      checked={granted.has(perm.permission_id)}
                                      disabled={busy}
                                      onCheckedChange={(checked) =>
                                        toggle(perm.permission_id, Boolean(checked))
                                      }
                                      aria-label={perm.code}
                                    />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  {perm.description ?? perm.code}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t p-3">
        <div className="min-h-5 text-sm">
          {error ? (
            <span className="text-destructive" role="alert">
              {error}
            </span>
          ) : notice ? (
            <span className="text-success" role="status">
              {notice}
            </span>
          ) : null}
        </div>
        <Button onClick={onSave} disabled={busy || loading || roleId === null}>
          {busy ? "Guardando…" : "Guardar permisos"}
        </Button>
      </div>
    </div>
  );
}
