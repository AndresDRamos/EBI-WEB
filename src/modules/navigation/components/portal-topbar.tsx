"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, Menu, Shield, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { NavIcon } from "@/modules/navigation/icons";
import type { ResolvedNavSection } from "@/modules/navigation/db";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/lib/auth/rbac";

/**
 * Portal header: logo, DB-driven topbar sections (ordered by role priority —
 * see `getNavForUser`), and the account menu. On mobile the section tabs
 * collapse into a dropdown and the active section's items are reachable from
 * a drawer dialog (the icon-rail sidebar is hidden below `md`).
 */
export function PortalTopbar({
  user,
  sections,
  activeSection,
}: {
  user: SessionUser;
  sections: ResolvedNavSection[];
  activeSection: ResolvedNavSection | null;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  return (
    <header className="flex h-14 items-center justify-between gap-3 bg-ezi-gray px-4 text-white">
      <div className="flex min-w-0 items-center gap-2">
        {activeSection && activeSection.items.length > 0 ? (
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-white hover:bg-white/10 md:hidden"
            aria-label="Abrir menú de sección"
          >
            <Menu className="h-4 w-4" />
          </button>
        ) : null}
        <Link href="/dashboards" className="flex shrink-0 items-center">
          <Image
            src="/EZI-LOGO-POSITIVO.png"
            alt="EZI Metales"
            width={120}
            height={40}
            className="h-8 w-auto object-contain"
            priority
          />
        </Link>
        <SectionTabs sections={sections} pathname={pathname} />
      </div>
      <UserMenu user={user} />
      <MobileNavDrawer
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
        section={activeSection}
        pathname={pathname}
      />
    </header>
  );
}

function SectionTabs({
  sections,
  pathname,
}: {
  sections: ResolvedNavSection[];
  pathname: string;
}) {
  if (sections.length === 0) return null;
  return (
    <>
      <nav className="hidden items-center gap-1 overflow-x-auto md:flex">
        {sections.map((s) => (
          <SectionTab key={s.section_id} section={s} pathname={pathname} />
        ))}
      </nav>
      <MobileSectionMenu sections={sections} pathname={pathname} />
    </>
  );
}

function SectionTab({
  section,
  pathname,
}: {
  section: ResolvedNavSection;
  pathname: string;
}) {
  const active = pathname === section.base_path || pathname.startsWith(section.base_path + "/");
  const href = section.items[0]?.href ?? section.base_path;
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-4 text-sm transition-colors",
        active
          ? "border-ezi-orange font-semibold text-white"
          : "border-transparent text-white/70 hover:text-white",
      )}
    >
      <NavIcon name={section.icon} className="h-4 w-4" />
      {section.label}
    </Link>
  );
}

function MobileSectionMenu({
  sections,
  pathname,
}: {
  sections: ResolvedNavSection[];
  pathname: string;
}) {
  const active = sections.find(
    (s) => pathname === s.base_path || pathname.startsWith(s.base_path + "/"),
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 truncate rounded-sm px-2 py-1.5 text-sm text-white hover:bg-white/10 md:hidden"
        >
          {active ? active.label : "Secciones"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {sections.map((s) => (
          <DropdownMenuItem key={s.section_id} asChild>
            <Link href={s.items[0]?.href ?? s.base_path}>{s.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileNavDrawer({
  open,
  onOpenChange,
  section,
  pathname,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: ResolvedNavSection | null;
  pathname: string;
}) {
  if (!section) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-0 top-0 h-dvh max-h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 rounded-none border-r sm:max-w-[85vw]">
        <DialogTitle>{section.label}</DialogTitle>
        <nav className="flex flex-col gap-1 overflow-y-auto">
          {section.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <React.Fragment key={item.item_id}>
                <Link
                  href={item.href}
                  onClick={() => onOpenChange(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-sm px-3 py-2 text-sm",
                    active ? "bg-orange-50 font-semibold text-ezi-gray" : "text-gray-700 hover:bg-gray-100",
                  )}
                >
                  <NavIcon name={item.icon} className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
                {item.children.length > 0 ? (
                  <div className="ml-6 flex flex-col gap-0.5 border-l pl-2">
                    {item.children.map((child) => (
                      <Link
                        key={child.item_id}
                        href={child.href}
                        onClick={() => onOpenChange(false)}
                        className="rounded-sm px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </React.Fragment>
            );
          })}
        </nav>
      </DialogContent>
    </Dialog>
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
          className="flex shrink-0 items-center gap-3 rounded-sm p-1 text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-50"
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
