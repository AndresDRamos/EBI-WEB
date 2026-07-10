"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Self-service password change. Calls POST /api/org/profile/password. On success
 * other sessions (and other tabs of this session) are invalidated via the
 * token_version bump enforced in src/auth.ts.
 */
export function ChangePasswordForm() {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);

  React.useEffect(() => {
    if (ok) {
      const t = setTimeout(() => setOk(false), 4000);
      return () => clearTimeout(t);
    }
  }, [ok]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(false);
    if (!current || !next || !confirm) {
      setError("Completa los tres campos.");
      return;
    }
    if (next.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (next !== confirm) {
      setError("La confirmación no coincide con la nueva contraseña.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/org/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "No se pudo cambiar la contraseña.");
        return;
      }
      setOk(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch {
      setError("Error inesperado. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4">
      <div className="space-y-2">
        <Label htmlFor="pwd-current">Contraseña actual *</Label>
        <Input
          id="pwd-current"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          disabled={busy}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pwd-new">Nueva contraseña *</Label>
        <Input
          id="pwd-new"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          disabled={busy}
          required
          minLength={8}
        />
        <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="pwd-confirm">Confirmar nueva contraseña *</Label>
        <Input
          id="pwd-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={busy}
          required
          minLength={8}
        />
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {ok ? (
        <p className="text-sm text-success" role="status">
          Contraseña actualizada. Otras sesiones activas se cerrarán.
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Guardando…" : "Cambiar contraseña"}
      </Button>
    </form>
  );
}