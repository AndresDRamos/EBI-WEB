/**
 * "Celdas operativas" group of the production module: a single unified
 * screen (plant tabs -> location cards -> cells), same header treatment as
 * admin's single-screen groups (e.g. `admin/portal/layout.tsx`). No
 * `PageTabs` here — the plant switcher is data-driven state, not routes (see
 * `operative-cells-page.tsx`). The production gate lives in the parent
 * `production/layout.tsx`.
 */
export default function ProductionOperativeCellsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold">Celdas operativas</h1>
        <p className="text-sm text-muted-foreground">
          Estructura de celdas por planta y ubicación, con sus equipos activos.
        </p>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
