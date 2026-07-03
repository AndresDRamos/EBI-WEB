import { PageTabs } from "@/components/kit/page-tabs";

/**
 * "Portal" group of the admin panel: navigation modules and action
 * permissions. Tabs are real routes (see kit `PageTabs`); each tab page keeps
 * its own server-side data loading. The admin gate lives in the parent
 * `admin/layout.tsx`.
 */
export default function AdminPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Portal</h1>
        <p className="text-sm text-muted-foreground">
          Módulos de navegación y permisos por acción.
        </p>
      </header>
      <PageTabs
        tabs={[
          { href: "/admin/portal/modules", label: "Módulos" },
          { href: "/admin/portal/permissions", label: "Permisos" },
        ]}
      />
      {children}
    </div>
  );
}
