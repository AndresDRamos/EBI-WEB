"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bookmark } from "lucide-react";
import type { Report, Page } from "powerbi-client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface DrillReportRef {
  report_id: number;
  name: string;
}

export interface NavDrillthroughProps {
  /** The currently embedded report instance. */
  report: Report | null;
  /** Other reports available for portal-level cross-report navigation. */
  otherReports?: DrillReportRef[];
  className?: string;
}

/**
 * Portal-level navigation for an embedded report:
 * - Page navigation via `report.setPage` / `page.setActive`.
 * - Bookmarks via `report.bookmarksManager.apply`.
 * - Cross-report navigation (router) to another dashboard. Native Power BI
 *   cross-report drill-through is used inside the report canvas when configured;
 *   this provides the portal-level jump across reports.
 */
export function NavDrillthrough({
  report,
  otherReports = [],
  className,
}: NavDrillthroughProps) {
  const router = useRouter();
  const [pages, setPages] = React.useState<Page[]>([]);
  const [activePage, setActivePage] = React.useState<string | null>(null);
  const [bookmarks, setBookmarks] = React.useState<
    { name: string; displayName: string }[]
  >([]);

  React.useEffect(() => {
    if (!report) return;
    let cancelled = false;
    async function load() {
      try {
        const allPages = await report!.getPages();
        if (cancelled) return;
        const visible = allPages.filter(
          (p) => p.visibility === 0 || p.isActive,
        );
        setPages(visible);
        const active = allPages.find((p) => p.isActive);
        setActivePage(active ? active.name : (allPages[0]?.name ?? null));
        try {
          const list = await report!.bookmarksManager.getBookmarks();
          if (!cancelled) {
            setBookmarks(
              list.map((b) => ({
                name: b.name,
                displayName:
                  (b as { displayName?: string }).displayName ?? b.name,
              })),
            );
          }
        } catch {
          setBookmarks([]);
        }
      } catch (err) {
         
        console.error("Failed to load report pages:", err);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [report]);

  async function goToPage(page: Page) {
    if (!report) return;
    try {
      await report.setPage(page.name);
      setActivePage(page.name);
    } catch (err) {
       
      console.error("setPage failed:", err);
    }
  }

  async function applyBookmark(name: string) {
    if (!report || !name) return;
    try {
      await report.bookmarksManager.apply(name);
    } catch (err) {
       
      console.error("apply bookmark failed:", err);
    }
  }

  function navigateToReport(id: number) {
    if (!id) return;
    router.push(`/dashboards/${id}`);
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-lg border bg-white p-4 text-sm",
        className,
      )}
    >
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Páginas
        </h3>
        {pages.length === 0 ? (
          <p className="text-muted-foreground">Sin páginas disponibles.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {pages.map((page) => (
              <Button
                key={page.name}
                size="sm"
                variant={
                  activePage === page.name ? "default" : "outline"
                }
                onClick={() => goToPage(page)}
              >
                {page.displayName || page.name}
              </Button>
            ))}
          </div>
        )}
      </div>

      {bookmarks.length > 0 ? (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Marcadores
          </h3>
          <div className="flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-muted-foreground" />
            <Select
              value=""
              onChange={(e) => applyBookmark(e.target.value)}
              className="max-w-xs"
            >
              <option value="">Aplicar marcador…</option>
              {bookmarks.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.displayName}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ) : null}

      {otherReports.length > 0 ? (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Navegación entre reportes
          </h3>
          <div className="flex items-center gap-2">
            <Select
              value=""
              onChange={(e) =>
                navigateToReport(Number(e.target.value))
              }
              className="max-w-xs"
            >
              <option value="">Ir a otro reporte…</option>
              {otherReports.map((r) => (
                <option key={r.report_id} value={r.report_id}>
                  {r.name}
                </option>
              ))}
            </Select>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      ) : null}
    </div>
  );
}