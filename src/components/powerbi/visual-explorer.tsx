"use client";

import * as React from "react";
import type { Report, Page, VisualDescriptor } from "powerbi-client";
import { EmbedVisual } from "@/components/powerbi/embed-visual";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface VisualExplorerProps {
  report: Report | null;
  workspaceGuid: string;
  reportGuid: string;
  className?: string;
}

/**
 * Lists the pages and visuals of an embedded report and embeds a single chosen
 * visual (`embedVisual` semantics) next to, or instead of, the full report. Lets
 * the portal compose individual visuals (Milestone 1 single-visual embedding).
 */
export function VisualExplorer({
  report,
  workspaceGuid,
  reportGuid,
  className,
}: VisualExplorerProps) {
  const [pages, setPages] = React.useState<Page[]>([]);
  const [visuals, setVisuals] = React.useState<VisualDescriptor[]>([]);
  const [pageName, setPageName] = React.useState<string>("");
  const [visualName, setVisualName] = React.useState<string>("");

  React.useEffect(() => {
    if (!report) return;
    let cancelled = false;
    report
      .getPages()
      .then((allPages) => {
        if (cancelled) return;
        const visible = allPages.filter(
          (p) => p.visibility === 0 || p.isActive,
        );
        setPages(visible);
        const active = allPages.find((p) => p.isActive);
        const first = active ?? visible[0];
        setPageName(first ? first.name : "");
        if (first) {
          void first
            .getVisuals()
            .then((v) => {
              if (!cancelled) setVisuals(v);
            })
            .catch((err) => {
               
              console.error("getVisuals failed:", err);
            });
        }
      })
      .catch((err) => {
         
        console.error("getPages failed:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [report]);

  async function onSelectPage(name: string) {
    setPageName(name);
    setVisualName("");
    setVisuals([]);
    if (!report) return;
    const page = pages.find((p) => p.name === name);
    if (!page) return;
    try {
      setVisuals(await page.getVisuals());
    } catch (err) {
       
      console.error("getVisuals failed:", err);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-white p-4",
        className,
      )}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Visual individual
      </h3>
      <p className="text-sm text-muted-foreground">
        Seleccione una página y un visual para embeberlo de forma aislada.
      </p>
      <div className="flex flex-wrap gap-2">
        <Select
          value={pageName}
          onChange={(e) => onSelectPage(e.target.value)}
          disabled={pages.length === 0}
          className="max-w-xs"
        >
          <option value="">Página…</option>
          {pages.map((p) => (
            <option key={p.name} value={p.name}>
              {p.displayName || p.name}
            </option>
          ))}
        </Select>
        <Select
          value={visualName}
          onChange={(e) => setVisualName(e.target.value)}
          disabled={visuals.length === 0}
          className="max-w-xs"
        >
          <option value="">Visual…</option>
          {visuals.map((v) => (
            <option key={v.name} value={v.name}>
              {v.title || v.name} ({v.type})
            </option>
          ))}
        </Select>
      </div>
      {pageName && visualName ? (
        <div className="h-[420px] w-full overflow-hidden rounded-md border">
          <EmbedVisual
            workspaceGuid={workspaceGuid}
            reportGuid={reportGuid}
            pageName={pageName}
            visualName={visualName}
            className="h-full w-full"
          />
        </div>
      ) : null}
    </div>
  );
}