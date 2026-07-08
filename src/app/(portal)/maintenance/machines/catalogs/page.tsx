import { PageTabs } from "@/components/kit/page-tabs";
import {
  listAssetCategories,
  listAssetTypes,
} from "@/modules/maintenance/db";
import { MachineCatalogsPage } from "@/modules/maintenance/components/machine-catalogs-page";
import { MACHINES_TABS } from "@/modules/maintenance/components/machines-tabs";

export const dynamic = "force-dynamic";

/** Catálogos — configurable asset categories (matrícula prefix) and their
 * types, as a Categoría→Tipos grouped table. Static sibling of the machines
 * cards view (wins over the `[code]` detail segment). */
export default async function MachineCatalogsRoute() {
  const [categories, types] = await Promise.all([
    listAssetCategories().catch(() => []),
    listAssetTypes().catch(() => []),
  ]);

  return (
    <div className="space-y-4">
      <PageTabs tabs={MACHINES_TABS} />
      <MachineCatalogsPage
        categories={categories.map((c) => ({
          asset_category_id: c.asset_category_id,
          code: c.code,
          name: c.name,
          code_prefix: c.code_prefix,
          is_active: c.is_active,
        }))}
        types={types.map((t) => ({
          asset_type_id: t.asset_type_id,
          asset_category_id: t.asset_category_id,
          code: t.code,
          name: t.name,
          is_active: t.is_active,
        }))}
      />
    </div>
  );
}
