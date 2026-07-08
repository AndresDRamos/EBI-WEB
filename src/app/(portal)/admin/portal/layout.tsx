/**
 * "Portal" group of the admin panel: a single unified screen (Permisos) that
 * covers permissions, nav-section access/order and menu structure CRUD. The
 * admin gate lives in the parent `admin/layout.tsx`.
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
          Gestor de permisos: acciones por rol, y acceso/orden/estructura del
          menú de navegación.
        </p>
      </header>
      {children}
    </div>
  );
}
