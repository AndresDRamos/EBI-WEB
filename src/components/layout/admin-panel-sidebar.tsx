"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  Factory,
  KeyRound,
  ShieldCheck,
  UserSquare2,
  UserCog,
  Tags,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionLink {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const usuarioChildren: SectionLink[] = [
  { href: "/admin/users", label: "Usuarios", icon: UserCog },
  { href: "/admin/roles", label: "Perfiles de acceso", icon: ShieldCheck },
  { href: "/admin/plants", label: "Plantas", icon: Factory },
  { href: "/admin/departments", label: "Departamentos", icon: Building2 },
];

/**
 * Sidebar for the Administración panel. Replaces the global portal rail under
 * `/admin/*` (PortalShell hides the global one when the path starts with
 * `/admin`). Three sections:
 *   1. Usuarios — expands Usuarios/Roles/Plantas/Departamentos (always shown).
 *   2. Configuración de accesos a módulos — nav registry (sections/items/grants).
 *   3. Catálogo de reportes Power BI (placeholder, reuses ReportAdminTable).
 */
export function AdminPanelSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-4 hidden h-[calc(100vh-5.5rem)] w-60 shrink-0 border bg-white md:flex md:flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Tags className="h-4 w-4 text-ezi-orange" />
        <span className="text-sm font-semibold uppercase tracking-wide text-ezi-gray">
          Administración
        </span>
      </div>
      <nav className="flex flex-col gap-2 overflow-y-auto p-3">
        <section className="space-y-1">
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Usuarios
          </p>
          {usuarioChildren.map((item) => {
            const active =
              item.href === "/admin/users"
                ? pathname === item.href || pathname.startsWith(item.href + "/")
                : pathname === item.href ||
                  pathname.startsWith(item.href + "/");
            return (
              <SidebarLink
                key={item.href}
                item={item}
                active={active}
              />
            );
          })}
        </section>

        <div className="-mx-3 my-1 h-px bg-border" />

        <section className="space-y-1">
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Módulos
          </p>
          <SidebarLink
            item={{ href: "/admin/access", label: "Accesos a módulos", icon: Lock }}
            active={pathname === "/admin/access"}
          />
          <SidebarLink
            item={{ href: "/admin/permissions", label: "Permisos por acción", icon: KeyRound }}
            active={pathname === "/admin/permissions"}
          />
        </section>

        <div className="-mx-3 my-1 h-px bg-border" />

        <section className="space-y-1">
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Power BI
          </p>
          <SidebarLink
            item={{ href: "/admin/reports", label: "Catálogo de reportes", icon: BarChart3 }}
            active={
              pathname === "/admin/reports" ||
              pathname === "/admin/reports/new" ||
              /^\/admin\/reports\/\d+\/edit$/.test(pathname)
            }
            muted
          />
        </section>
      </nav>
      <div className="mt-auto flex items-center gap-2 border-t p-4 text-xs text-muted-foreground">
        <UserSquare2 className="h-3 w-3" />
        Sección en construcción.
      </div>
    </aside>
  );
}

function SidebarLink({
  item: { href, label, icon: Icon },
  active,
  muted,
}: {
  item: SectionLink;
  active: boolean;
  muted?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-sm px-3 py-2 text-sm transition-colors",
        active
          ? "bg-orange-50 font-semibold text-ezi-gray border-l-2 border-ezi-orange"
          : muted
            ? "text-muted-foreground hover:bg-gray-100 hover:text-ezi-gray"
            : "text-gray-700 hover:bg-gray-100",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}