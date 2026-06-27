import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserDetail } from "@/lib/db/users";
import { ProfileView } from "@/components/profile/profile-view";

export const dynamic = "force-dynamic";

/**
 * Mi perfil — any authenticated user (NOT gated to admins). Reads the
 * profile from the DB server-side via getUserDetail: the JWT does not carry
 * email/plants/departments, so sourcing them from the session would be lossy.
 */
export default async function ProfilePage() {
  const session = await auth();
  const userId = session?.user?.userId;
  if (!userId) redirect("/login");

  const detail = await getUserDetail(userId);
  if (!detail) {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Mi perfil</h1>
        <p className="text-sm text-muted-foreground">
          Datos de tu cuenta y cambio de contraseña.
        </p>
      </header>
      <ProfileView
        user={{
          username: detail.username,
          email: detail.email,
          display_name: detail.display_name,
          all_plants: detail.all_plants,
          is_active: detail.is_active,
          roles: detail.roles.map((r) => r.name),
          plants: detail.plants.map((p) => ({ code: p.code, name: p.name })),
          departments: detail.departments.map((d) => ({ name: d.name })),
        }}
      />
    </div>
  );
}