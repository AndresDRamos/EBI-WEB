"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Username + password login form (Auth.js v5 Credentials provider).
 * EZI-branded. On success redirects to the portal; on failure shows the
 * error inline (generic message — never reveal which of user/password was
 * wrong).
 */
export function LoginForm({ className }: { className?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/dashboards";

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn("credentials", {
      username: username.trim().toLowerCase(),
      password,
      redirect: false,
    });
    if (!res || res.error) {
      setError("Usuario o contraseña incorrectos.");
      setBusy(false);
      return;
    }
    if (!res.ok) {
      setError("Usuario o contraseña incorrectos.");
      setBusy(false);
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className={className}>
      <div className="space-y-2">
        <Label htmlFor="username">Usuario</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          maxLength={64}
          disabled={busy}
        />
      </div>
      <div className="mt-4 space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          maxLength={128}
          disabled={busy}
        />
      </div>
      {error ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="mt-5 w-full" disabled={busy}>
        <LogIn className="h-4 w-4" />
        {busy ? "Verificando…" : "Iniciar sesión"}
      </Button>
    </form>
  );
}