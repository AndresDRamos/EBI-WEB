"use client";

import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ValidationReport } from "@/modules/production/dxf/geometry";

/** Tone classes mirror the `badge.tsx` `error`/`warning`/`info` variants
 * (same semantic colors), just laid out as a full-width row instead of a pill. */
const SEVERITY: Record<
  ValidationReport["lines"][number]["severity"],
  { row: string; icon: typeof AlertCircle }
> = {
  error: { row: "border-red-200 bg-red-50 text-red-800", icon: AlertCircle },
  warning: {
    row: "border-amber-200 bg-amber-50 text-amber-800",
    icon: AlertTriangle,
  },
  info: {
    row: "border-border bg-muted/40 text-muted-foreground",
    icon: Info,
  },
};

/**
 * DXF validation report: one line per contract rule outcome. `error` lines
 * block confirming the draft; `warning`/`info` are advisory (CAD contract).
 */
export function ValidationReportView({ report }: { report: ValidationReport }) {
  if (report.lines.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {report.lines.map((l, i) => {
        const { row, icon: Icon } = SEVERITY[l.severity];
        return (
          <div
            key={i}
            className={cn(
              "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
              row,
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-mono text-xs opacity-70">[{l.code}]</span>{" "}
              {l.message}
            </span>
          </div>
        );
      })}
    </div>
  );
}
