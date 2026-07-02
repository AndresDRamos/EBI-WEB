import { notFound } from "next/navigation";
import { getReport, listCategories } from "@/modules/reports/db";
import { ReportForm } from "@/modules/reports/components/report-form";

export const dynamic = "force-dynamic";

export default async function EditReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const report = await getReport(id).catch(() => undefined);
  if (!report) notFound();

  const categories = await listCategories().catch(() => []);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">Editar reporte</h1>
      <ReportForm
        categories={categories.map((c) => ({
          category_id: c.category_id,
          name: c.name,
        }))}
        initial={{
          report_id: report.report_id,
          name: report.name,
          workspace_guid: report.workspace_guid,
          report_guid: report.report_guid,
          dataset_guid: report.dataset_guid,
          category_id: report.category_id,
          description: report.description,
          sort_order: report.sort_order,
          is_active: Boolean(report.is_active),
        }}
      />
    </div>
  );
}