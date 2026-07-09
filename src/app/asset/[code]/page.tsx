import { notFound, redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { auth } from "@/auth";
import {
  listAssets,
  listAssetCategories,
  listAssetTypes,
} from "@/modules/maintenance/db";
import { listPlants } from "@/modules/org/db/org";
import { listLocations } from "@/modules/org/db/locations";
import { listCells, currentCellNamesByAssets } from "@/modules/production/db";
import { getPermissionCodesForRoles } from "@/modules/org/db/permissions";
import { navRoleKey } from "@/modules/navigation/cache";
import { PermissionsProvider } from "@/components/providers/permissions-provider";
import { MachineStandaloneView } from "@/modules/maintenance/components/machine-standalone-view";
import type {
  ParentOption,
  TypeOption,
} from "@/modules/maintenance/components/machine-form-dialog";
import type { MachineRow } from "@/modules/maintenance/components/machines-cards-page";

export const dynamic = "force-dynamic";

// Same cache key + tag as the portal layout so grant mutations invalidate
// this page's permission set too.
const getCachedPermissions = unstable_cache(
  async (roleKey: string) =>
    getPermissionCodesForRoles(roleKey ? roleKey.split(",") : []),
  ["portal-permissions"],
  { tags: ["permissions"] },
);

/**
 * QR landing page — `/asset/[code]`, OUTSIDE the `(portal)` group on purpose:
 * scanning a label on the floor opens the equipment detail flat on the page,
 * with no topbar/sidebar. Authentication still applies (middleware
 * default-deny + the `auth()` check here); actions are permission-gated the
 * same way as in the portal.
 */
export default async function AssetQrLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const session = await auth();
  if (!session?.user?.userId) redirect("/login");
  const roles = session.user.roles ?? [];
  const isAdmin = roles.includes("admin");
  const permissionCodes = isAdmin
    ? []
    : await getCachedPermissions(navRoleKey(roles));

  const code = decodeURIComponent((await params).code);
  // The modal surface renders from a MachineRow + the same option lists the
  // cards page uses — resolve them all here (catalog sizes keep this cheap).
  const [assets, plants, locations, cells, categories, types] = await Promise.all([
    listAssets().catch(() => []),
    listPlants(true).catch(() => []),
    listLocations(true).catch(() => []),
    listCells(true).catch(() => []),
    listAssetCategories(true).catch(() => []),
    listAssetTypes(true).catch(() => []),
  ]);
  const asset = assets.find((a) => a.code === code);
  if (!asset) notFound();
  // Every active asset is a potential "Equipo padre" candidate, so its cell
  // names are needed for the picker's compact preview, not just the current one.
  const cellNames = await currentCellNamesByAssets(
    assets.map((a) => a.asset_id),
  ).catch(() => new Map<number, string[]>());

  const categoryName = new Map(
    categories.map((c) => [c.asset_category_id, c.name]),
  );
  const typeOptions: TypeOption[] = types
    .filter((t) => categoryName.has(t.asset_category_id))
    .map((t) => ({
      asset_type_id: t.asset_type_id,
      name: t.name,
      asset_category_id: t.asset_category_id,
      category_name: categoryName.get(t.asset_category_id) ?? "",
      process_names: t.process_names,
    }));

  const row: MachineRow = {
    asset_id: asset.asset_id,
    code: asset.code,
    name: asset.name,
    brand: asset.brand,
    model: asset.model,
    serial_number: asset.serial_number,
    location_id: asset.location_id,
    location_name: asset.location_name,
    plant_id: asset.plant_id,
    plant_name: asset.plant_name,
    asset_type_id: asset.asset_type_id,
    type_name: asset.type_name,
    category_name: asset.category_name,
    parent_asset_id: asset.parent_asset_id,
    installation_date: asset.installation_date
      ? asset.installation_date.toISOString()
      : null,
    image_blob_path: asset.image_blob_path,
    notes: asset.notes,
    process_names: asset.process_names,
    cell_names: cellNames.get(asset.asset_id) ?? [],
    is_active: asset.is_active,
  };

  const parents: ParentOption[] = assets
    .filter((a) => a.is_active)
    .map((a) => ({
      asset_id: a.asset_id,
      code: a.code,
      name: a.name,
      brand: a.brand,
      model: a.model,
      serial_number: a.serial_number,
      category_name: a.category_name,
      type_name: a.type_name,
      plant_name: a.plant_name,
      location_name: a.location_name,
      cell_names: cellNames.get(a.asset_id) ?? [],
      has_image: a.image_blob_path !== null,
    }));

  return (
    <PermissionsProvider isAdmin={isAdmin} codes={permissionCodes}>
      <main className="min-h-screen bg-background">
        <MachineStandaloneView
          row={row}
          plants={plants.map((p) => ({ plant_id: p.plant_id, name: p.name }))}
          locations={locations.map((l) => ({
            location_id: l.location_id,
            plant_id: l.plant_id,
            plant_name: l.plant_name,
            name: l.name,
          }))}
          cells={cells.map((c) => ({
            cell_id: c.cell_id,
            code: c.code,
            name: c.name,
            location_id: c.location_id,
          }))}
          types={typeOptions}
          parents={parents}
        />
      </main>
    </PermissionsProvider>
  );
}
