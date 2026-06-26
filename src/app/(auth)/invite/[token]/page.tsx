import Link from "next/link";
import { findPendingInvitation } from "@/lib/db/users";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";

export const dynamic = "force-dynamic";

/**
 * Invitation acceptance page. The admin pre-provisions the user (with roles/
 * plants/departments) and issues a one-time token; the invitee lands here to
 * set a password, which activates the account. The token is shown to the
 * admin as a copyable link (manual delivery until email is wired).
 */
export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await findPendingInvitation(token).catch(() => null);

  return (
    <main className="w-full max-w-md">
      <div className="rounded-lg border border-white/10 bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <span
            aria-hidden
            className="inline-block h-8 w-8 rounded-full bg-ezi-orange"
          />
          <span className="text-xl font-bold tracking-tight text-ezi-gray">
            EBI
          </span>
        </div>

        {invitation ? (
          <>
            <h1 className="text-2xl font-bold text-ezi-gray">Activar cuenta</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Establezca una contraseña para su cuenta. El usuario es{" "}
              <strong className="text-ezi-gray">{invitation.username}</strong>.
            </p>
            <div className="mt-6">
              <AcceptInviteForm token={token} username={invitation.username} />
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-ezi-gray">
              Invitación inválida
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              El enlace es inválido, ya fue utilizado o ha expirado. Solicite un
              nuevo enlace a un administrador.
            </p>
            <div className="mt-6">
              <Link
                href="/login"
                className="inline-flex h-9 items-center rounded-sm bg-ezi-orange px-4 text-sm font-medium text-white hover:bg-orange-600"
              >
                Ir a iniciar sesión
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}