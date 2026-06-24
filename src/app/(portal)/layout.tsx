"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
} from "@azure/msal-react";
import { PortalShell } from "@/components/portal-shell";

/** Sends unauthenticated visitors to the login page. */
function RedirectToLogin() {
  const router = useRouter();
  React.useEffect(() => {
    router.replace("/login");
  }, [router]);
  return null;
}

/** Protects everything under (portal): requires an Entra session. */
export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AuthenticatedTemplate>
        <PortalShell>{children}</PortalShell>
      </AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        <RedirectToLogin />
      </UnauthenticatedTemplate>
    </>
  );
}