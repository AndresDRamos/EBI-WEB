"use client";

import * as React from "react";
import { MsalProvider } from "@azure/msal-react";
import { PublicClientApplication } from "@azure/msal-browser";
import { msalConfig } from "@/lib/auth/msal-config";

/**
 * Constructs a single PublicClientApplication on the client and wraps the app
 * in the MSAL React provider. Must be a client component because MSAL uses
 * browser-only APIs.
 */
export function MsalProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pca] = React.useState(
    () => new PublicClientApplication(msalConfig),
  );

  React.useEffect(() => {
    // Handle any redirect promise left in the URL after an interactive login.
    pca.handleRedirectPromise().catch((error) => {
       
      console.error("MSAL redirect handling failed:", error);
    });
  }, [pca]);

  return <MsalProvider instance={pca}>{children}</MsalProvider>;
}