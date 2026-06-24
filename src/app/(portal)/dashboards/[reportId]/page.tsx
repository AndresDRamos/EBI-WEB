import { notFound } from "next/navigation";
import {
  getReport,
  listActiveReports,
} from "@/lib/db/reports";
import { DashboardDetail } from "@/components/powerbi/dashboard-detail";

export const dynamic = "force-dynamic";

export default async function DashboardDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }

  const report = await getReport(id).catch((err) => {
     
    console.error("Failed to load report:", err);
    return undefined;
  });

  if (!report) {
    notFound();
  }

  const allReports = await listActiveReports().catch((err) => {
     
    console.error("Failed to load reports for navigation:", err);
    return [];
  });

  const otherReports = allReports
    .filter((r) => r.report_id !== id)
    .map((r) => ({ report_id: r.report_id, name: r.name }));

  return (
    <DashboardDetail
      report={{
        report_id: report.report_id,
        name: report.name,
        description: report.description,
        workspace_guid: report.workspace_guid,
        report_guid: report.report_guid,
      }}
      otherReports={otherReports}
    />
  );
}