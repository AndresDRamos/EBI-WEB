"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { LayoutDashboard, Settings, LogOut, User, Shield } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/lib/auth/rbac";

const navItems = [
  { href: "/dashboards", label: "Dashboards", icon: LayoutDashboard },
  { href: "/admin", label: "Administración", icon: Settings },
];

/**
 * Top bar + sidebar shell for the authenticated portal. The left rail stays
 * global, but is hidden on `/admin/*` where the nested admin panel layout
 * provides its own sidebar (avoids a double rail). The avatar dropdown is
 * rebuilt on shadcn `DropdownMenu` (radix) — accessible focus/aria handling,
 * retiring the hand-rolled click-outside logic.
 */
export function PortalShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAdmin = user.roles.includes("admin");
  const hideGlobalSidebar = pathname.startsWith("/admin");

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex min-h-screen flex-col">
        <header className="flex h-14 items-center justify-between bg-ezi-gray px-4 text-white">
          <Link href="/dashboards" className="flex items-center">
            <Image
              src="/EZI-LOGO-POSITIVO.png"
              alt="EZI Metales"
              width={120}
              height={40}
              className="h-8 w-auto object-contain"
              priority
            />
          </Link>
          <UserMenu user={user} />
        </header>

        <div className="flex flex-1">
          {!hideGlobalSidebar ? (
            <aside className="hidden w-56 shrink-0 border-r bg-white md:block">
              <nav className="flex flex-col gap-1 p-3">
                {navItems
                  .filter((item) => item.href !== "/admin" || isAdmin)
                  .map((item) => {
                    const active =
                      pathname === item.href ||
                      (item.href !== "/admin" &&
                        pathname.startsWith(item.href + "/"));
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
          ) : null}

          <main className="flex-1 bg-gray-50 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}

function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const isAdmin = user.roles.includes("admin");

  async function handleSignOut() {
    setBusy(true);
    await signOut({ redirect: false });
    router.replace("/login");
  }

  const initials = user.name
    ? user.name
        .split(" ")
        .slice(0, 2)
        .map((p) => p[0])
        .join("")
        .toUpperCase()
    : (user.username?.[0]?.toUpperCase() ?? "");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-3 rounded-sm p-1 text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-50"
          disabled={busy}
        >
          <div className="hidden text-right sm:block">
            <div className="text-sm font-medium leading-4">
              {user.name ?? user.username}
            </div>
            <div className="text-xs text-gray-400">{user.username}</div>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xs font-semibold">
            {initials}
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-0.5 normal-case">
            <span className="text-sm font-medium text-foreground">
              {user.name ?? user.username}
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {user.username}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/profile")}>
          <User className="h-4 w-4" />
          Mi perfil
        </DropdownMenuItem>
        {isAdmin ? (
          <DropdownMenuItem onSelect={() => router.push("/admin")}>
            <Shield className="h-4 w-4" />
            Panel de administración
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut} disabled={busy}>
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}