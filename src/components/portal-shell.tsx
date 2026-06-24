"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import { LayoutDashboard, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/dashboards", label: "Dashboards", icon: LayoutDashboard },
  { href: "/admin", label: "Administración", icon: Settings },
];

/** Top bar + sidebar shell for the authenticated portal. */
export function PortalShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between bg-ezi-gray px-4 text-white">
        <Link href="/dashboards" className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-5 w-5 rounded-full bg-ezi-orange"
          />
          <span className="text-base font-bold tracking-tight">EBI</span>
          <span className="hidden text-sm text-gray-400 sm:inline">
            · Inteligencia de negocio
          </span>
        </Link>
        <UserMenu />
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 border-r bg-white md:block">
          <nav className="flex flex-col gap-1 p-3">
            {navItems.map((item) => {
              const active =
                pathname === item.href ||
                pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-sm px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-orange-50 font-semibold text-ezi-gray"
                      : "text-gray-700 hover:bg-gray-100",
                    active && "border-l-2 border-ezi-orange",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 bg-gray-50 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

function UserMenu() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const initials = account?.name
    ? account.name
        .split(" ")
        .slice(0, 2)
        .map((p) => p[0])
        .join("")
        .toUpperCase()
    : (account?.username?.[0]?.toUpperCase() ?? "");

  return (
    <div className="flex items-center gap-3">
      {account ? (
        <div className="hidden text-right sm:block">
          <div className="text-sm font-medium leading-4">{account.name}</div>
          <div className="text-xs text-gray-400">{account.username}</div>
        </div>
      ) : null}
      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xs font-semibold">
        {initials}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 text-white hover:bg-white/10 hover:text-white"
        onClick={() => instance.logoutRedirect({ account })}
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Salir</span>
      </Button>
    </div>
  );
}