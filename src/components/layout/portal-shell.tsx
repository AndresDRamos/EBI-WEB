"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PortalTopbar } from "@/modules/navigation/components/portal-topbar";
import { PortalSidebar } from "@/modules/navigation/components/portal-sidebar";
import { ADMIN_NAV_SECTION } from "@/components/layout/admin-nav";
import type { ResolvedNavSection } from "@/modules/navigation/db";
import type { SessionUser } from "@/lib/auth/rbac";

/**
 * Top bar + sidebar shell for the authenticated portal. Sections and items
 * come from the DB nav registry (resolved server-side in `(portal)/layout.tsx`
 * and passed down — see `getNavForUser`). Under `/admin/*` the same
 * `PortalSidebar` renders the code-built `ADMIN_NAV_SECTION` instead of the
 * active portal section (one rail component, no bespoke admin sidebar).
 * Content never scrolls the whole page: `main` clips to the viewport and
 * pages own their internal scroll.
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
  const isAdminPanel = pathname.startsWith("/admin");

  const activeSection = isAdminPanel
    ? ADMIN_NAV_SECTION
    : sections.find(
        (s) => pathname === s.base_path || pathname.startsWith(s.base_path + "/"),
      ) ?? null;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid h-dvh grid-rows-[auto_1fr]">
        <PortalTopbar user={user} sections={sections} activeSection={activeSection} />

        <div className="flex min-h-0">
          <PortalSidebar section={activeSection} initialPinned={initialSidebarPinned} />
          <main className="min-w-0 flex-1 overflow-hidden bg-gray-50">
            <div className="h-full overflow-y-auto p-4 sm:p-6">{children}</div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
