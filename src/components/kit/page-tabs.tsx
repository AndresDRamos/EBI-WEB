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
 * sub-routes keep their parent tab highlighted; when one tab's href nests
 * under another's (e.g. `/x` and `/x/catalogs`), only the longest match
 * activates.
 */
export function PageTabs({ tabs }: { tabs: PageTab[] }) {
  const pathname = usePathname();
  const activeHref = tabs
    .filter(
      (t) => pathname === t.href || pathname.startsWith(t.href + "/"),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className="flex items-end gap-1 border-b" aria-label="Secciones">
      {tabs.map((tab) => {
        const active = tab.href === activeHref;
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
