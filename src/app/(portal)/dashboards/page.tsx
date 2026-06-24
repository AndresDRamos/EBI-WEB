import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { listActiveReports } from "@/lib/db/reports";
import type { ReportWithCategory } from "@/lib/db/reports";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function DashboardsPage() {
  const reports = await listActiveReports().catch((err) => {
    // Surface DB unavailability to the admin rather than crashing the route.
     
    console.error("Failed to load reports:", err);
    return [] as ReportWithCategory[];
  });

  const grouped = groupByCategory(reports);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-center gap-3">
        <LayoutDashboard className="h-6 w-6 text-ezi-orange" />
        <div>
          <h1 className="text-2xl font-bold">Dashboards</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo de reportes de Power BI.
          </p>
        </div>
      </header>

      {reports.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-8">
          {grouped.map((group) => (
            <section key={group.categoryKey}>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-lg font-semibold">
                  {group.categoryName}
                </h2>
                <Badge variant="muted">{group.reports.length}</Badge>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.reports.map((report) => (
                  <Link
                    key={report.report_id}
                    href={`/dashboards/${report.report_id}`}
                    className="group block rounded-lg border bg-white p-5 shadow-sm transition-colors hover:border-ezi-orange"
                  >
                    <h3 className="font-semibold text-ezi-gray group-hover:text-ezi-orange">
                      {report.name}
                    </h3>
                    {report.description ? (
                      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                        {report.description}
                      </p>
                    ) : null}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

interface ReportGroup {
  categoryKey: string;
  categoryName: string;
  reports: ReportWithCategory[];
}

function groupByCategory(reports: ReportWithCategory[]): ReportGroup[] {
  const map = new Map<string, ReportGroup>();
  for (const report of reports) {
    const key = String(report.category_id ?? "uncategorized");
    const name = report.category_name ?? "Sin categoría";
    const existing = map.get(key);
    if (existing) {
      existing.reports.push(report);
    } else {
      map.set(key, { categoryKey: key, categoryName: name, reports: [report] });
    }
  }
  return Array.from(map.values());
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed bg-white p-10 text-center">
      <p className="text-sm text-muted-foreground">
        No hay reportes activos configurados. Diríjase a{" "}
        <Link href="/admin" className="font-medium text-ezi-orange">
          Administración
        </Link>{" "}
        para registrar reportes.
      </p>
    </div>
  );
}