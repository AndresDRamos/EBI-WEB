import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import { auth } from "@/auth";
import { PortalShell } from "@/components/portal-shell";
import { getNavForUser } from "@/lib/db/nav";
import { SIDEBAR_PIN_COOKIE } from "@/lib/nav/pin-cookie";
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

  const [sections, cookieStore] = await Promise.all([
    getCachedNav([...user.roles].sort().join(","), isAdmin),
    cookies(),
  ]);
  const initialSidebarPinned = cookieStore.get(SIDEBAR_PIN_COOKIE)?.value === "1";

  return (
    <PortalShell
      user={user}
      sections={sections}
      initialSidebarPinned={initialSidebarPinned}
    >
      {children}
    </PortalShell>
  );
}