"use client";

import * as React from "react";
import { useMsal } from "@azure/msal-react";
import { models } from "powerbi-client";
import { embedMode, powerbiScope } from "@/lib/auth/msal-config";

export type EmbedTokenStatus = "idle" | "loading" | "ready" | "error";

export interface EmbedTokenResult {
  token: string;
  tokenType: models.TokenType;
}

export interface UseEmbedToken {
  token: EmbedTokenResult | null;
  status: EmbedTokenStatus;
  error: string | null;
  reload: () => void;
}

/**
 * Mode-agnostic embed-token seam (ADR 0001).
 *
 * - Development (`org-embed`): acquires the user's AAD token via MSAL for the
 *   Power BI scope and returns `tokenType: Aad`.
 * - Production (`capacity`): NOT implemented in this milestone. The branch is a
 *   clearly-marked placeholder that, in Milestone 3, will call `/api/embed-token`
 *   to obtain a service-principal embed token (`tokenType: Embed`).
 *
 * Only the token acquisition forks — the embed component does not.
 */
export function useEmbedToken(): UseEmbedToken {
  const { instance, accounts } = useMsal();
  const account = accounts[0] ?? null;
  const [token, setToken] = React.useState<EmbedTokenResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  // Invalidate the cached token when the signed-in account changes. Comparing
  // the account identifier lets us clear only on a real change, which the
  // effect's setState calls below are conditional on a tracked previous value
  // (not an unconditional synchronous reset).
  const accountId = account?.homeAccountId ?? null;
  const lastAccountIdRef = React.useRef<string | null>(null);

  const status: EmbedTokenStatus = account
    ? error
      ? "error"
      : token
        ? "ready"
        : "loading"
    : "idle";

  React.useEffect(() => {
    const lastAccountId = lastAccountIdRef.current;
    lastAccountIdRef.current = accountId;

    if (!accountId) {
      // No signed-in account: nothing to fetch. We don't need to clear here —
      // `status` already resolves to "idle" and the embed component won't use
      // a cached token. The token is refreshed once an account reappears.
      return;
    }

    if (lastAccountId !== accountId) {
      // Account switched: a new token is required. Discard the previous one
      // asynchronously via the fetch callbacks below.
      setToken(null);
      setError(null);
    }

    let cancelled = false;
    acquireEmbedToken(instance, account!)
      .then((result) => {
        if (!cancelled) {
          setToken(result);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setToken(null);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance, accountId, nonce]);

  return { token, status, error, reload: () => setNonce((n) => n + 1) };
}

type MsalInstance = ReturnType<typeof useMsal>["instance"];
type MsalAccount = NonNullable<ReturnType<typeof useMsal>["accounts"][number]>;

async function acquireEmbedToken(
  instance: MsalInstance,
  account: MsalAccount,
): Promise<EmbedTokenResult> {
  if (embedMode === "capacity") {
    // ============================================================
    // PRODUCTION (app-owns-data, service principal) — Milestone 3.
    // POST /api/embed-token with the report/workspace ids and the
    // user's UPN as effectiveIdentity for RLS. NOT implemented now.
    // ============================================================
    throw new Error(
      "Capacity embed mode is not implemented yet (Milestone 3).",
    );
  }

  const scopes = [powerbiScope];
  try {
    const silent = await instance.acquireTokenSilent({ scopes, account });
    return { token: silent.accessToken, tokenType: models.TokenType.Aad };
  } catch {
    // Silent failed (missing consent, expired SSO, etc.) → interactive popup.
    const interactive = await instance.acquireTokenPopup({ scopes, account });
    return { token: interactive.accessToken, tokenType: models.TokenType.Aad };
  }
}