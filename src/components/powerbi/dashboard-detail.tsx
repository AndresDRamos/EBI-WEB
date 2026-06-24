"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { Report } from "powerbi-client";
import { Button } from "@/components/ui/button";
import { EmbedReport } from "@/components/powerbi/embed-report";
import {
  NavDrillthrough,
  type DrillReportRef,
} from "@/components/powerbi/nav-drillthrough";
import { VisualExplorer } from "@/components/powerbi/visual-explorer";

export interface DashboardDetailProps {
  report: {
    report_id: number;
    name: string;
    description: string | null;
    workspace_guid: string;
    report_guid: string;
  };
  otherReports: DrillReportRef[];
}

/** Client wrapper that owns the embedded Power BI `Report` instance. */
export function DashboardDetail({
  report,
  otherReports,
}: DashboardDetailProps) {
  const router = useRouter();
  const [reportInstance, setReportInstance] =
    React.useState<Report | null>(null);

  return (
    <div className="mx-auto max-w-6xl">
      <Button
        variant="ghost"
        size="sm"
        className="mb-3"
        onClick={() => router.push("/dashboards")}
      >
        <ArrowLeft />
        Volver al catálogo
      </Button>

      <header className="mb-4">
        <h1 className="text-2xl font-bold">{report.name}</h1>
        {report.description ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {report.description}
          </p>
        ) : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="flex flex-col gap-4">
          <div className="h-[640px] w-full overflow-hidden rounded-lg border bg-white">
            <EmbedReport
              workspaceGuid={report.workspace_guid}
              reportGuid={report.report_guid}
              onReportReady={setReportInstance}
              className="h-full w-full"
            />
          </div>
          <VisualExplorer
            report={reportInstance}
            workspaceGuid={report.workspace_guid}
            reportGuid={report.report_guid}
          />
        </div>

        <NavDrillthrough
          report={reportInstance}
          otherReports={otherReports}
          className="h-fit"
        />
      </div>
    </div>
  );
}