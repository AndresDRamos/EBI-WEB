import { MachinesCardsPage } from "@/modules/maintenance/components/machines-cards-page";
import { getMachinesCatalogViewModel } from "@/modules/maintenance/view-models";

export const dynamic = "force-dynamic";

/** Equipos — maintenance asset catalog as cards. Action visibility is resolved
 * client-side by `useCan` (PermissionsProvider in the portal layout). */
export default async function MachinesPage() {
  const { rows, plants, locations, cells, types } =
    await getMachinesCatalogViewModel();

  return (
    <MachinesCardsPage
      machines={rows}
      plants={plants}
      locations={locations}
      cells={cells}
      types={types}
    />
  );
}
