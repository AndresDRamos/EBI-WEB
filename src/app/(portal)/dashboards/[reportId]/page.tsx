import { notFound } from "next/navigation";
import Link from "next/link";
import { getReport } from "@/modules/reports/db";

export const dynamic = "force-dynamic";

/**
 * Placeholder for the embedded report detail. Power BI embedding is out of
 * v1 (plan 0002) and will return as a dedicated Embedded module. The
 * `dbo.report` catalog stays as a dormant, auth-protected catalog.
 */
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

  const report = await getReport(id).catch(() => undefined);
  if (!report) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link
        href="/dashboards"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ezi-gray"
      >
        <ArrowBack />
        Volver al catálogo
      </Link>

      <header>
        <h1 className="text-2xl font-bold">{report.name}</h1>
        {report.description ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {report.description}
          </p>
        ) : null}
      </header>

      <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-white p-10 text-center">
        <ConstructionIcon />
        <p className="text-sm font-medium text-ezi-gray">
          El embebido de Power BI estará disponible próximamente.
        </p>
        <p className="max-w-md text-xs text-muted-foreground">
          Este reporte está registrado en el catálogo. La capa de embebido se
          reincorporará como módulo dedicado (app-owns-data) en una versión
          posterior de EBI.
        </p>
      </div>
    </div>
  );
}

function ArrowBack() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function ConstructionIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-ezi-orange"
    >
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </svg>
  );
}