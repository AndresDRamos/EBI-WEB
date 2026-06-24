import { SignInButton } from "@/components/auth/sign-in-button";

export default function LoginPage() {
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
        <h1 className="text-2xl font-bold text-ezi-gray">
          Portal de inteligencia de negocio
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Inicie sesión con su cuenta de Microsoft para acceder a los reportes
          de Power BI.
        </p>
        <div className="mt-6">
          <SignInButton />
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Acceso restringido a usuarios autorizados de EZI Metales.
        </p>
      </div>
    </main>
  );
}