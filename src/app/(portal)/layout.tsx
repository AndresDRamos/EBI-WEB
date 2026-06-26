import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PortalShell } from "@/components/portal-shell";
import type { SessionUser } from "@/lib/auth/rbac";

/**
 * Guard for everything under `(portal)`. Server-side: middleware already
 * rejects unauthenticated requests, but `auth()` here gives the layout the
 * user to render the shell with (and is a second line of defense).
 */
export const dynamic = "force-dynamic";

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

  return <PortalShell user={user}>{children}</PortalShell>;
}