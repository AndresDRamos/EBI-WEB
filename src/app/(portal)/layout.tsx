import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import { auth } from "@/auth";
import { PortalShell } from "@/components/layout/portal-shell";
import { PermissionsProvider } from "@/components/providers/permissions-provider";
import { getNavForUser } from "@/modules/navigation/db";
import { getPermissionCodesForRoles } from "@/modules/org/db/permissions";
import { SIDEBAR_PIN_COOKIE } from "@/modules/navigation/pin-cookie";
import type { SessionUser } from "@/lib/auth/rbac";

/**
 * Guard for everything under `(portal)`. Server-side: middleware already
 * rejects unauthenticated requests, but `auth()` here gives the layout the
 * user to render the shell with (and is a second line of defense).
 */
export const dynamic = "force-dynamic";

// Nav tables are tiny (<10 sections, <100 items, <200 grants — see the V7
// dba review) but resolving them on every shell render is still one query
// too many. Cache per role-set, invalidated by `revalidateTag("nav")` from
// every /api/nav/* mutation.
const getCachedNav = unstable_cache(
  async (roleKey: string, isAdmin: boolean) =>
    getNavForUser(roleKey ? roleKey.split(",") : [], isAdmin),
  ["portal-nav"],
  { tags: ["nav"] },
);

// Same treatment for the permission code set consumed by `useCan` (plan
// 0006): cached per role-set, invalidated by `revalidateTag("permissions")`
// from the grants mutation. Admin never queries — app-layer bypass.
const getCachedPermissions = unstable_cache(
  async (roleKey: string) =>
    getPermissionCodesForRoles(roleKey ? roleKey.split(",") : []),
  ["portal-permissions"],
  { tags: ["permissions"] },
);

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.userId) {
    redirect("/login");
  }

  const user: SessionUser = {
    id: session.user.userId,
    name: session.user.name ?? null,
    username: session.user.username ?? "",
    roles: session.user.roles ?? [],
  };
  const isAdmin = user.roles.includes("admin");

  const roleKey = [...user.roles].sort().join(",");
  const [sections, permissionCodes, cookieStore] = await Promise.all([
    getCachedNav(roleKey, isAdmin),
    isAdmin ? Promise.resolve([]) : getCachedPermissions(roleKey),
    cookies(),
  ]);
  const initialSidebarPinned = cookieStore.get(SIDEBAR_PIN_COOKIE)?.value === "1";

  return (
    <PermissionsProvider isAdmin={isAdmin} codes={permissionCodes}>
      <PortalShell
        user={user}
        sections={sections}
        initialSidebarPinned={initialSidebarPinned}
      >
        {children}
      </PortalShell>
    </PermissionsProvider>
  );
}