"use client";

import * as React from "react";

/**
 * Client-side permission context for `useCan` (plan 0006). The code set is
 * resolved SERVER-SIDE in `(portal)/layout.tsx` and passed down — no fetch,
 * no flash. It may go stale during a session (grants edited elsewhere); that
 * is accepted: the UI only shows/hides actions, `requirePermission` on the
 * API is the real barrier and re-checks per request.
 */

interface PermissionsContextValue {
  isAdmin: boolean;
  codes: ReadonlySet<string>;
}

const PermissionsContext = React.createContext<PermissionsContextValue>({
  isAdmin: false,
  codes: new Set(),
});

export function PermissionsProvider({
  isAdmin,
  codes,
  children,
}: {
  isAdmin: boolean;
  codes: string[];
  children: React.ReactNode;
}) {
  const value = React.useMemo(
    () => ({ isAdmin, codes: new Set(codes) as ReadonlySet<string> }),
    [isAdmin, codes],
  );
  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

/**
 * `can("maintenance.asset:create")` → may the current user perform the
 * action? The protected `admin` profile is always true (app-layer bypass,
 * same rule as `requirePermission` / `getNavForUser`).
 */
export function useCan(): (code: string) => boolean {
  const { isAdmin, codes } = React.useContext(PermissionsContext);
  return React.useCallback(
    (code: string) => isAdmin || codes.has(code),
    [isAdmin, codes],
  );
}
