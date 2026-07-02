import Link from "next/link";
import { BarChart3 } from "lucide-react";
import {
  adminListReports,
  listCategories,
} from "@/modules/reports/db";
import { ReportAdminTable } from "@/modules/reports/components/report-admin-table";
import { CategoryManager } from "@/modules/reports/components/category-manager";

export const dynamic = "force-dynamic";

/**
 * `/admin/reports` — Catálogo de reportes Power BI placeholder. Relocates the
 * M2 report admin content under the panel sidebar (literally reuses the
 * existing `ReportAdminTable` + `CategoryManager`); intentionally NOT
 * refactored to DataTable (focused change — see plan 0003).
 */
export default async function AdminReportsPage() {
  const [reports, categories] = await Promise.all([
    adminListReports().catch((err) => {
      console.error("admin list failed:", err);
      return [];
    }),
    listCategories().catch((err) => {
      console.error("categories failed:", err);
      return [];
    }),
  ]);

  const rows = reports.map((r) => ({
    report_id: r.report_id,
    name: r.name,
    category_name: r.category_name,
    sort_order: r.sort_order,
    is_active: r.is_active,
    updated_at:
      r.updated_at instanceof Date
        ? r.updated_at.toISOString()
        : String(r.updated_at),
  }));

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6 text-ezi-orange" />
        <div>
          <h1 className="text-2xl font-bold">Catálogo de reportes Power BI</h1>
          <p className="text-sm text-muted-foreground">
            Inventaria los reportes y categorías. El embebido de Power BI se
            reincorporará como módulo dedicado (app-owns-data).
          </p>
        </div>
      </header>

      <ReportAdminTable rows={rows} />

      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryManager categories={categories} />
        <div className="rounded-lg border bg-white p-4 text-sm text-muted-foreground">
          <h2 className="mb-2 font-semibold text-ezi-gray">
            Catálogo de reportes
          </h2>
          <p>
            El embebido de Power BI está fuera de v1 y se reincorporará como
            módulo dedicado (app-owns-data). Mientras tanto, este catálogo se
            mantiene como inventario dormiente, protegido por autenticación.
          </p>
          <p className="mt-2">
            <Link href="/dashboards" className="font-medium text-ezi-orange">
              Ver catálogo del portal →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}