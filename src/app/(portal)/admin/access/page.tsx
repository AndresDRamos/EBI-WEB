import { Lock } from "lucide-react";

export const dynamic = "force-dynamic";

/** Configuración de accesos a módulos — placeholder (out of scope for plan 0003). */
export default function AdminAccessPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-center gap-3">
        <Lock className="h-6 w-6 text-ezi-orange" />
        <div>
          <h1 className="text-2xl font-bold">Configuración de accesos a módulos</h1>
          <p className="text-sm text-muted-foreground">
            Próximamente. Definirá permisos por módulo y por rol.
          </p>
        </div>
      </header>
      <div className="grid place-items-center rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        <p>
          Sección pendiente de diseño dentro del roadmap del portal EBI. Aquí se
          administrará, por módulo (Planeación, ETL EPS→EBI, control interno) y
          por rol, el acceso a los datos. Por ahora usa la página
          <span className="font-medium text-ezi-gray"> Usuarios </span>
          para configurar las asignaciones por usuario / rol / planta /
          departamento.
        </p>
      </div>
    </div>
  );
}