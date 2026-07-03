"use client";

import * as React from "react";
import { KeyRound } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

export interface PermissionOption {
  permission_id: number;
  code: string;
  description: string | null;
}

export interface ProfileOption {
  role_id: number;
  name: string;
}

/**
 * Access profile → permission grants, replace-set per profile (same pattern
 * as NavGrantsPanel). The protected `admin` profile is excluded: it bypasses
 * at the app layer, granting it would be a no-op (and the API rejects it).
 * Permissions are grouped by `<module>.<resource>` for scanability; the
 * catalog itself is migration-seeded and read-only here.
 */
export function PermissionGrantsPanel({
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
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (roleId === null) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      setSaved(false);
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

  async function onSave() {
    if (roleId === null) return;
    setBusy(true);
    setError(null);
    setSaved(false);
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
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  // Group by `<module>.<resource>` (everything before the `:action` part).
  const groups = React.useMemo(() => {
    const byGroup = new Map<string, PermissionOption[]>();
    for (const p of permissions) {
      const key = p.code.split(":")[0] ?? p.code;
      const arr = byGroup.get(key) ?? [];
      arr.push(p);
      byGroup.set(key, arr);
    }
    return [...byGroup.entries()];
  }, [permissions]);

  function toggle(permissionId: number, checked: boolean) {
    setGranted((prev) => {
      const next = new Set(prev);
      if (checked) next.add(permissionId);
      else next.delete(permissionId);
      return next;
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center gap-3">
        <KeyRound className="h-5 w-5 text-ezi-orange" />
        <h2 className="font-semibold leading-tight">Permisos por perfil de acceso</h2>
      </div>
      <div className="mb-4 flex items-center gap-3">
        <Label htmlFor="grants-profile" className="shrink-0">
          Perfil
        </Label>
        <Select
          id="grants-profile"
          className="max-w-xs"
          value={roleId ?? ""}
          onChange={(e) => setRoleId(Number(e.target.value))}
        >
          {nonAdminProfiles.map((p) => (
            <option key={p.role_id} value={p.role_id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        El perfil <span className="font-medium">admin</span> siempre tiene acceso total y no
        aparece aquí. Los permisos los siembran las migraciones de cada módulo; el panel solo
        asigna o revoca.
      </p>
      {nonAdminProfiles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay perfiles de acceso. Créalos en Perfiles de acceso.
        </p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <div className="space-y-4">
          {groups.map(([group, perms]) => (
            <div key={group}>
              <p className="mb-1 font-mono text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group}
              </p>
              <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {perms.map((p) => (
                  <label
                    key={p.permission_id}
                    className="flex items-start gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-gray-50"
                  >
                    <Checkbox
                      checked={granted.has(p.permission_id)}
                      disabled={busy}
                      onCheckedChange={(checked) => toggle(p.permission_id, Boolean(checked))}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-mono text-xs font-medium">
                        {p.code.split(":")[1] ?? p.code}
                      </span>
                      {p.description ? (
                        <span className="block text-xs text-muted-foreground">
                          {p.description}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {error ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="mt-3 text-sm text-success" role="status">
          Permisos guardados.
        </p>
      ) : null}
      <div className="mt-4 flex justify-end">
        <Button onClick={onSave} disabled={busy || loading || roleId === null}>
          {busy ? "Guardando…" : "Guardar permisos"}
        </Button>
      </div>
    </div>
  );
}
