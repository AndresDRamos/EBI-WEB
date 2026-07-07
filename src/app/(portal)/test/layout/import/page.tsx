import { listPlants } from "@/modules/org/db/org";
import { LayoutImportWizard } from "@/modules/production/components/layout-import-wizard";

export const dynamic = "force-dynamic";

/** Importar layout — DXF upload wizard (draft → report/preview → confirm). */
export default async function LayoutImportRoute() {
  const plants = await listPlants(true).catch(() => []);
  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Importar layout (DXF)</h1>
        <p className="text-sm text-muted-foreground">
          Sube el plano calcado con las capas EBI-* del contrato CAD. El
          importador valida el contrato, muestra el reporte y una vista previa;
          al confirmar, la versión se activa y las colocaciones vigentes se
          migran a la nueva versión.
        </p>
      </div>
      <LayoutImportWizard
        plants={plants.map((p) => ({ plant_id: p.plant_id, name: p.name }))}
      />
    </div>
  );
}
