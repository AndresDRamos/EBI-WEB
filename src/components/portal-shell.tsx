"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PortalTopbar } from "@/components/nav/portal-topbar";
import { PortalSidebar } from "@/components/nav/portal-sidebar";
import type { ResolvedNavSection } from "@/lib/db/nav";
import type { SessionUser } from "@/lib/auth/rbac";

/**
 * Top bar + sidebar shell for the authenticated portal. Sections and items
 * come from the DB nav registry (resolved server-side in `(portal)/layout.tsx`
 * and passed down — see `getNavForUser`). The rail hides on `/admin/*`, where
 * the nested admin panel layout supplies its own sidebar (avoids a double
 * rail). Content never scrolls the whole page: `main` clips to the viewport
 * and pages own their internal scroll.
 */
export function PortalShell({
  user,
  sections,
  initialSidebarPinned,
  children,
}: {
  user: SessionUser;
  sections: ResolvedNavSection[];
  initialSidebarPinned: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hideGlobalSidebar = pathname.startsWith("/admin");

  const activeSection =
    sections.find(
      (s) => pathname === s.base_path || pathname.startsWith(s.base_path + "/"),
    ) ?? null;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid h-dvh grid-rows-[auto_1fr]">
        <PortalTopbar user={user} sections={sections} activeSection={activeSection} />

        <div className="flex min-h-0">
          {!hideGlobalSidebar ? (
            <PortalSidebar section={activeSection} initialPinned={initialSidebarPinned} />
          ) : null}
          <main className="min-w-0 flex-1 overflow-hidden bg-gray-50">
            <div className="h-full overflow-y-auto p-4 sm:p-6">{children}</div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
