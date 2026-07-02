"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Pin, PinOff } from "lucide-react";
import { NavIcon } from "@/lib/nav/icons";
import type { ResolvedNavItem, ResolvedNavSection } from "@/lib/db/nav";
import { cn } from "@/lib/utils";
import { setSidebarPinned } from "@/lib/nav/pin-action";

/**
 * Per-section sidebar. A 64px icon rail stays in the layout flow at all
 * times (no reflow); on hover it grows to a 240px panel rendered as an
 * absolutely-positioned overlay on top of the content. Pinning promotes the
 * panel to a real 240px in-flow column and persists the choice in a cookie
 * (`setSidebarPinned`) so the next SSR render starts already expanded.
 */
export function PortalSidebar({
  section,
  initialPinned,
}: {
  section: ResolvedNavSection | null;
  initialPinned: boolean;
}) {
  const pathname = usePathname();
  const [pinned, setPinned] = React.useState(initialPinned);
  const [hovered, setHovered] = React.useState(false);
  const expanded = pinned || hovered;

  if (!section || section.items.length === 0) return null;

  function togglePin() {
    const next = !pinned;
    setPinned(next);
    void setSidebarPinned(next);
  }

  return (
    <aside
      className={cn(
        "relative hidden shrink-0 transition-[width] duration-200 ease-out md:block",
        pinned ? "w-60" : "w-16",
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={cn(
          "flex h-full flex-col overflow-y-auto border-r bg-white",
          pinned
            ? "w-60"
            : cn(
                "absolute inset-y-0 left-0 shadow-lg transition-[width] duration-200 ease-out",
                hovered ? "w-60" : "w-16",
              ),
        )}
      >
        <div className="flex h-12 items-center justify-between border-b px-3">
          <span
            className={cn(
              "truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-opacity",
              expanded ? "opacity-100 delay-100" : "opacity-0",
            )}
          >
            {section.label}
          </span>
          {expanded ? (
            <button
              type="button"
              onClick={togglePin}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-gray-100 hover:text-ezi-orange"
              aria-label={pinned ? "Dejar de fijar el panel" : "Fijar panel"}
              aria-pressed={pinned}
            >
              {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </button>
          ) : null}
        </div>
        <nav className="flex flex-col gap-1 p-2">
          {section.items.map((item) => (
            <SidebarItem key={item.item_id} item={item} pathname={pathname} expanded={expanded} />
          ))}
        </nav>
      </div>
    </aside>
  );
}

function SidebarItem({
  item,
  pathname,
  expanded,
}: {
  item: ResolvedNavItem;
  pathname: string;
  expanded: boolean;
}) {
  const active = pathname === item.href || pathname.startsWith(item.href + "/");
  return (
    <div>
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors",
          active
            ? "bg-orange-50 font-semibold text-ezi-gray"
            : "text-gray-700 hover:bg-gray-100",
        )}
      >
        <NavIcon name={item.icon} className="h-4 w-4 shrink-0" />
        <span
          className={cn(
            "truncate whitespace-nowrap transition-opacity",
            expanded ? "opacity-100 delay-100" : "w-0 overflow-hidden opacity-0",
          )}
        >
          {item.label}
        </span>
      </Link>
      {expanded && item.children.length > 0 ? (
        <div className="ml-6 mt-0.5 flex flex-col gap-0.5 border-l pl-2">
          {item.children.map((child) => {
            const childActive =
              pathname === child.href || pathname.startsWith(child.href + "/");
            return (
              <Link
                key={child.item_id}
                href={child.href}
                className={cn(
                  "truncate whitespace-nowrap rounded-sm px-2 py-1.5 text-sm transition-colors",
                  childActive
                    ? "font-semibold text-ezi-gray"
                    : "text-gray-600 hover:bg-gray-100",
                )}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
