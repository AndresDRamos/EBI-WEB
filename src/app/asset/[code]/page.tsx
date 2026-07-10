import { notFound, redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { auth } from "@/auth";
import { getPermissionCodesForRoles } from "@/modules/org/db/permissions";
import { navRoleKey } from "@/modules/navigation/cache";
import { PermissionsProvider } from "@/components/providers/permissions-provider";
import { MachineStandaloneView } from "@/modules/maintenance/components/machine-standalone-view";
import { getMachinesCatalogViewModel } from "@/modules/maintenance/view-models";

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
  const { rows, parents, plants, locations, cells, types } =
    await getMachinesCatalogViewModel();
  const row = rows.find((r) => r.code === code);
  if (!row) notFound();

  return (
    <PermissionsProvider isAdmin={isAdmin} codes={permissionCodes}>
      <main className="min-h-screen bg-background">
        <MachineStandaloneView
          row={row}
          plants={plants}
          locations={locations}
          cells={cells}
          types={types}
          parents={parents}
        />
      </main>
    </PermissionsProvider>
  );
}
