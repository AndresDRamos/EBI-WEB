import { Settings } from "lucide-react";
import { listCategories } from "@/modules/reports/db";
import { ReportForm } from "@/modules/reports/components/report-form";

export const dynamic = "force-dynamic";

export default async function NewReportPage() {
  const categories = await listCategories().catch(() => []);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-ezi-orange" />
        <h1 className="text-2xl font-bold">Nuevo reporte</h1>
      </header>
      <ReportForm
        categories={categories.map((c) => ({
          category_id: c.category_id,
          name: c.name,
        }))}
      />
    </div>
  );
}