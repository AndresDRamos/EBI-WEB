"use client";

import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface NavSectionOption {
  section_id: number;
  label: string;
}

export interface RoleOption {
  role_id: number;
  name: string;
}

interface GrantState {
  granted: boolean;
  priority: string;
}

/**
 * Role → section visibility + topbar priority, per section. Lower priority
 * sorts earlier in the user's topbar (ties break on the section's own
 * `sort_order`). The protected `admin` role always sees every active section
 * — it is intentionally excluded here, granting it would be a no-op.
 */
export function NavGrantsPanel({
  sections,
  roles,
}: {
  sections: NavSectionOption[];
  roles: RoleOption[];
}) {
  const nonAdminRoles = roles.filter((r) => r.name !== "admin");
  const [sectionId, setSectionId] = React.useState<number | null>(sections[0]?.section_id ?? null);
  const [grants, setGrants] = React.useState<Record<number, GrantState>>({});
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (sectionId === null) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      setSaved(false);
      try {
        const res = await fetch(`/api/nav/sections/${sectionId}/grants`);
        const d = (await res.json()) as { grants?: { role_id: number; priority: number }[] };
        if (cancelled) return;
        const byRole: Record<number, GrantState> = {};
        for (const r of nonAdminRoles) byRole[r.role_id] = { granted: false, priority: "100" };
        for (const g of d.grants ?? []) {
          byRole[g.role_id] = { granted: true, priority: String(g.priority) };
        }
        setGrants(byRole);
      } catch {
        if (!cancelled) setError("No se pudieron cargar los accesos.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // nonAdminRoles is derived from a stable prop; omit to avoid refetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId]);

  async function onSave() {
    if (sectionId === null) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const payload = Object.entries(grants)
      .filter(([, v]) => v.granted)
      .map(([roleId, v]) => ({
        role_id: Number(roleId),
        priority: Number(v.priority) || 0,
      }));
    try {
      const res = await fetch(`/api/nav/sections/${sectionId}/grants`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grants: payload }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudieron guardar los accesos.");
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-ezi-orange" />
        <h2 className="font-semibold leading-tight">Accesos por rol</h2>
      </div>
      <div className="mb-4 flex items-center gap-3">
        <Label htmlFor="grants-section" className="shrink-0">
          Sección
        </Label>
        <Select
          id="grants-section"
          className="max-w-xs"
          value={sectionId ?? ""}
          onChange={(e) => setSectionId(Number(e.target.value))}
        >
          {sections.map((s) => (
            <option key={s.section_id} value={s.section_id}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        El rol <span className="font-medium">admin</span> ve todas las secciones activas sin
        necesidad de un acceso explícito. Menor prioridad = aparece antes en el topbar del usuario.
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <div className="space-y-2">
          {nonAdminRoles.map((role) => {
            const g = grants[role.role_id] ?? { granted: false, priority: "100" };
            return (
              <div key={role.role_id} className="flex items-center gap-3 rounded-sm border px-3 py-2">
                <Checkbox
                  checked={g.granted}
                  onCheckedChange={(checked) =>
                    setGrants((prev) => ({
                      ...prev,
                      [role.role_id]: { ...g, granted: Boolean(checked) },
                    }))
                  }
                />
                <span className="flex-1 text-sm">{role.name}</span>
                <Label htmlFor={`priority-${role.role_id}`} className="text-xs text-muted-foreground">
                  Prioridad
                </Label>
                <Input
                  id={`priority-${role.role_id}`}
                  type="number"
                  className="w-20"
                  value={g.priority}
                  disabled={!g.granted}
                  onChange={(e) =>
                    setGrants((prev) => ({
                      ...prev,
                      [role.role_id]: { ...g, priority: e.target.value },
                    }))
                  }
                />
              </div>
            );
          })}
        </div>
      )}
      {error ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? <p className="mt-3 text-sm text-success" role="status">Accesos guardados.</p> : null}
      <div className="mt-4 flex justify-end">
        <Button onClick={onSave} disabled={busy || loading}>
          {busy ? "Guardando…" : "Guardar accesos"}
        </Button>
      </div>
    </div>
  );
}
