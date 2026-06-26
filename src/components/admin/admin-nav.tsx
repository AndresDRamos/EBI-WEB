"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Reportes" },
  { href: "/admin/users", label: "Usuarios" },
  { href: "/admin/plants", label: "Plantas" },
  { href: "/admin/departments", label: "Departamentos" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b">
      {items.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-ezi-orange font-semibold text-ezi-gray"
                : "border-transparent text-muted-foreground hover:text-ezi-gray",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}