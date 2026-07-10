"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Set-password form for invitation acceptance. Posts the one-time token +
 * new password to /api/org/invite/accept, then sends the user to /login.
 */
export function AcceptInviteForm({
  token,
  username,
}: {
  token: string;
  username: string;
}) {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/org/invite/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "No se pudo completar el registro.");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 1500);
  }

  if (done) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ezi-gray">
          Cuenta activada para <strong>{username}</strong>. Redirigiendo al
          inicio de sesión…
        </p>
        <Button className="w-full" onClick={() => router.push("/login")}>
          Ir a iniciar sesión
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="username-static">Usuario</Label>
        <Input id="username-static" value={username} disabled readOnly />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Nueva contraseña</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          disabled={busy}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirmar contraseña</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          disabled={busy}
        />
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Activando…" : "Activar cuenta"}
      </Button>
    </form>
  );
}