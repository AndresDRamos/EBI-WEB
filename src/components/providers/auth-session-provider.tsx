"use client";

import * as React from "react";
import { SessionProvider } from "next-auth/react";

/**
 * Thin client-side wrapper around Auth.js `SessionProvider`. Replaces the
 * former MSAL provider. Mounted once in the root layout so `useSession()`
 * is available to client components.
 */
export function AuthSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider>{children}</SessionProvider>;
}