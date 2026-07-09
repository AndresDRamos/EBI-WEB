import { listPlants } from "@/modules/org/db/org";
import { listLocations } from "@/modules/org/db/locations";
import {
  PlantsLocationsPage,
  type PlantGroupRow,
  type LocationChildRow,
} from "@/modules/org/components/plants-locations-page";

export const dynamic = "force-dynamic";

/** Plantas tab (Organización) — grouped plants → locations CRUD. */
export default async function AdminPlantsPage() {
  const [plants, locations] = await Promise.all([
    listPlants().catch(() => []),
    listLocations().catch(() => []),
  ]);

  const groups: PlantGroupRow[] = plants.map((p) => ({
    plant_id: p.plant_id,
    code: p.code,
    name: p.name,
    address: p.address,
    postal_code: p.postal_code,
    is_active: p.is_active,
  }));
  const children: LocationChildRow[] = locations.map((l) => ({
    location_id: l.location_id,
    plant_id: l.plant_id,
    code: l.code,
    name: l.name,
    is_active: l.is_active,
  }));

  return <PlantsLocationsPage plants={groups} locations={children} />;
}
