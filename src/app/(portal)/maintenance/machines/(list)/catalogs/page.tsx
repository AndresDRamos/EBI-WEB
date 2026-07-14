import { listAssetCategories, listAssetTypes } from "@/modules/maintenance/db";
import { listProcesses } from "@/modules/org/db/processes";
import { MachineCatalogsPage } from "@/modules/maintenance/components/machine-catalogs-page";

export const dynamic = "force-dynamic";

/** Catálogos — configurable asset categories and their types (matrícula
 * prefix + process live on the type since V18), as a Categoría→Tipos grouped
 * table. Static sibling of the machines cards view. */
export default async function MachineCatalogsRoute() {
  const [categories, types, processes] = await Promise.all([
    listAssetCategories().catch(() => []),
    listAssetTypes().catch(() => []),
    listProcesses(true).catch(() => []),
  ]);

  return (
    <MachineCatalogsPage
      categories={categories.map((c) => ({
        asset_category_id: c.asset_category_id,
        code: c.code,
        name: c.name,
        is_active: c.is_active,
      }))}
      types={types.map((t) => ({
        asset_type_id: t.asset_type_id,
        asset_category_id: t.asset_category_id,
        code: t.code,
        name: t.name,
        code_prefix: t.code_prefix,
        process_ids: t.process_ids,
        process_names: t.process_names,
        is_active: t.is_active,
      }))}
      processes={processes.map((p) => ({
        process_id: p.process_id,
        code: p.code,
        name: p.name,
      }))}
    />
  );
}
