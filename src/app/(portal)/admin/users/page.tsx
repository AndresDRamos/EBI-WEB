import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { listUsers, listPendingInvitations } from "@/lib/db/users";
import { assertAdminOrRedirect } from "@/lib/auth/rbac";
import { AdminUsersTable } from "@/components/admin/admin-users-table";
import { AdminNav } from "@/components/admin/admin-nav";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const ok = await assertAdminOrRedirect();
  if (!ok) redirect("/dashboards");

  const [users, invitations] = await Promise.all([
    listUsers().catch(() => []),
    listPendingInvitations().catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex items-center gap-3">
        <Users className="h-6 w-6 text-ezi-orange" />
        <div>
          <h1 className="text-2xl font-bold">Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            Cree usuarios, asigne roles/plantas/departamentos e invite.
          </p>
        </div>
      </header>

      <AdminNav />

      <AdminUsersTable
        users={users.map((u) => ({
          user_id: u.user_id,
          username: u.username,
          display_name: u.display_name,
          email: u.email,
          all_plants: u.all_plants,
          is_active: u.is_active,
          roles: u.roles,
          updated_at:
            u.updated_at instanceof Date
              ? u.updated_at.toISOString()
              : String(u.updated_at),
        }))}
        invitations={invitations.map((i) => ({
          invitation_id: i.invitation_id,
          username: i.username,
          expires_at:
            i.expires_at instanceof Date
              ? i.expires_at.toISOString()
              : String(i.expires_at),
        }))}
      />

      <div className="flex gap-4 text-sm">
        <Link href="/admin/plants" className="font-medium text-ezi-orange">
          Administrar plantas →
        </Link>
        <Link href="/admin/departments" className="font-medium text-ezi-orange">
          Administrar departamentos →
        </Link>
      </div>
    </div>
  );
}