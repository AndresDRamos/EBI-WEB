"use client";

import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import type { ValidationReport } from "@/modules/production/dxf/geometry";

/**
 * DXF validation report: one line per contract rule outcome. `error` lines
 * block confirming the draft; `warning`/`info` are advisory (CAD contract).
 */
export function ValidationReportView({ report }: { report: ValidationReport }) {
  if (report.lines.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {report.lines.map((l, i) => (
        <div
          key={i}
          className={
            l.severity === "error"
              ? "flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              : l.severity === "warning"
                ? "flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                : "flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
          }
        >
          {l.severity === "error" ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : l.severity === "warning" ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>
            <span className="font-mono text-xs opacity-70">[{l.code}]</span>{" "}
            {l.message}
          </span>
        </div>
      ))}
    </div>
  );
}
