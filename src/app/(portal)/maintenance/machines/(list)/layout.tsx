import { PageTabs } from "@/components/kit/page-tabs";
import { MACHINES_TABS } from "@/modules/maintenance/components/machines-tabs";

/**
 * "Administración de equipos" group: the machines catalog and its
 * configurable types. Route group (no URL segment) so this header/tabs
 * layout wraps only these two tab pages — `../[code]` (detail) and
 * `../[code]/label` (printable) stay siblings outside it, chrome-free.
 */
export default function MaintenanceMachinesListLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold">Administración de equipos</h1>
        <p className="text-sm text-muted-foreground">
          Catálogo de equipos por planta y los tipos de activo que los clasifican.
        </p>
      </header>
      <PageTabs tabs={MACHINES_TABS} />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
