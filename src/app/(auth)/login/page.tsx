import { Suspense } from "react";
import Image from "next/image";
import { LoginForm } from "@/modules/org/components/login-form";

/**
 * Portal login (username + password). Uses Auth.js v5 Credentials.
 * Unauthenticated by design; middleware redirects already-authenticated
 * visitors away to /dashboards.
 */
export default function LoginPage() {
  return (
    <main className="w-full max-w-md">
      <div className="rounded-lg border border-white/10 bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <span
            aria-hidden
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-ezi-orange"
          >
            <Image
              src="/EZI-E.png"
              alt=""
              width={28}
              height={28}
              className="object-contain brightness-0 invert"
              priority
            />
          </span>
          <h1 className="group flex items-center text-2xl font-bold tracking-tight">
            <span className="text-ezi-orange">B</span>
            <span className="inline-flex min-w-0 max-w-0 overflow-hidden transition-[max-width] duration-500 ease-out group-hover:max-w-[9rem]">
              <span className="whitespace-nowrap text-ezi-gray">usiness&nbsp;</span>
            </span>
            <span className="text-ezi-gray">I</span>
            <span className="inline-flex min-w-0 max-w-0 overflow-hidden transition-[max-width] duration-500 ease-out group-hover:max-w-[18rem]">
              <span className="whitespace-nowrap text-ezi-gray">ntelligence</span>
            </span>
          </h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Inicie sesión con su usuario y contraseña para acceder.
        </p>
        <div className="mt-6">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Acceso restringido a usuarios autorizados de EZI Metales. Si no
          tiene cuenta, solicítela a un administrador.
        </p>
      </div>
    </main>
  );
}