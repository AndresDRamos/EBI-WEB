"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface PageTab {
  href: string;
  label: string;
}

/**
 * Route-aware tab bar for pages grouped under a shared layout. Tabs are real
 * routes (deep-linkable; each tab keeps its own server component and data
 * loading). The active tab is derived from the pathname by prefix so detail
 * sub-routes keep their parent tab highlighted.
 */
export function PageTabs({ tabs }: { tabs: PageTab[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex items-end gap-1 border-b" aria-label="Secciones">
      {tabs.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm transition-colors",
              active
                ? "border-ezi-orange font-semibold text-ezi-gray"
                : "border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
