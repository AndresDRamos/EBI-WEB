import { PageTabs } from "@/components/kit/page-tabs";
import { MachinesCardsPage } from "@/modules/maintenance/components/machines-cards-page";
import { MACHINES_TABS } from "@/modules/maintenance/components/machines-tabs";
import { getMachinesCatalogViewModel } from "@/modules/maintenance/view-models";

export const dynamic = "force-dynamic";

/** Equipos — maintenance asset catalog as cards. Action visibility is resolved
 * client-side by `useCan` (PermissionsProvider in the portal layout). */
export default async function MachinesPage() {
  const { rows, plants, locations, cells, types } =
    await getMachinesCatalogViewModel();

  return (
    <div className="flex h-full flex-col gap-4">
      <PageTabs tabs={MACHINES_TABS} />
      <div className="min-h-0 flex-1">
        <MachinesCardsPage
          machines={rows}
          plants={plants}
          locations={locations}
          cells={cells}
          types={types}
        />
      </div>
    </div>
  );
}
