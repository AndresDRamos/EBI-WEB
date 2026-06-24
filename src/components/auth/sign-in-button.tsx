"use client";

import * as React from "react";
import { useMsal } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loginRequest } from "@/lib/auth/msal-config";

/** Sign-in button using MSAL popup, with redirect fallback. */
export function SignInButton({ className }: { className?: string }) {
  const { instance, accounts } = useMsal();
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (accounts.length > 0) {
      router.replace("/dashboards");
    }
  }, [accounts, router]);

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await instance.loginPopup(loginRequest);
      router.replace("/dashboards");
    } catch {
      // Popup blocked or cancelled → fall back to full-page redirect.
      try {
        await instance.loginRedirect(loginRequest);
      } catch (redirectErr) {
        setError(
          redirectErr instanceof Error
            ? redirectErr.message
            : "No se pudo iniciar sesión.",
        );
        setBusy(false);
      }
    }
  }

  return (
    <div className={className}>
      <Button onClick={handleSignIn} disabled={busy} className="w-full">
        <LogIn />
        {busy ? "Conectando…" : "Iniciar sesión con Microsoft"}
      </Button>
      {error ? (
        <p className="mt-3 text-sm text-destructive">{error}</p>
      ) : null}
    </div>
  );
}