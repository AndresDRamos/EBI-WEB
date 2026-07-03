import { PageTabs } from "@/components/kit/page-tabs";

/**
 * "Organización" group of the admin panel: people and org catalogs. Tabs are
 * real routes (see kit `PageTabs`); each tab page keeps its own server-side
 * data loading. The admin gate lives in the parent `admin/layout.tsx`.
 */
export default function AdminOrganizationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Organización</h1>
        <p className="text-sm text-muted-foreground">
          Usuarios, departamentos con sus roles y plantas.
        </p>
      </header>
      <PageTabs
        tabs={[
          { href: "/admin/organization/users", label: "Usuarios" },
          { href: "/admin/organization/departments", label: "Departamentos y roles" },
          { href: "/admin/organization/plants", label: "Plantas" },
        ]}
      />
      {children}
    </div>
  );
}
