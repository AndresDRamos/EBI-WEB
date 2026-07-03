import Link from "next/link";
import { auth } from "@/auth";
import { getCachedNav, navRoleKey } from "@/modules/navigation/cache";
import { NavIcon } from "@/modules/navigation/icons";
import { cn } from "@/lib/utils";

/**
 * Portal home (`/`) — the post-login landing, reachable by any authenticated
 * user without a nav grant (plan 0007). Replaces the old `/dashboards`
 * redirect. Shows an EZI welcome and a card per section the user can reach
 * (resolved from the same cached nav registry as the topbar; admins also see
 * dark-launched sections, dimmed and marked "oculta").
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth();
  const roles = session?.user?.roles ?? [];
  const isAdmin = roles.includes("admin");
  const displayName =
    session?.user?.name ?? session?.user?.username ?? "";
  const firstName = displayName.split(" ")[0] ?? displayName;

  const sections = await getCachedNav(navRoleKey(roles), isAdmin);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wide text-ezi-orange">
          EZI Business Intelligence
        </p>
        <h1 className="mt-1 text-3xl font-bold text-ezi-gray">
          {firstName ? `Hola, ${firstName}` : "Bienvenido"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Acceda a los módulos disponibles para su perfil.
        </p>
      </header>

      {sections.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Aún no tiene módulos asignados. Solicite acceso a un administrador.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => {
            const href = section.items[0]?.href ?? section.base_path;
            const hidden = !section.is_active;
            return (
              <Link
                key={section.section_id}
                href={href}
                title={
                  hidden
                    ? "Sección oculta para los usuarios (reactívala en Accesos a módulos)"
                    : undefined
                }
                className={cn(
                  "group flex items-start gap-4 rounded-lg border bg-white p-5 shadow-sm transition-colors hover:border-ezi-orange",
                  hidden && "opacity-60",
                )}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-orange-50 text-ezi-orange">
                  <NavIcon name={section.icon} className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-ezi-gray group-hover:text-ezi-orange">
                      {section.label}
                    </span>
                    {hidden ? (
                      <span className="rounded-sm border px-1 py-px text-[10px] uppercase tracking-wide text-muted-foreground">
                        oculta
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block font-mono text-xs text-muted-foreground">
                    {section.base_path}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
