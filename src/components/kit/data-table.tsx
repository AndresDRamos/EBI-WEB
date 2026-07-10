"use client";

import * as React from "react";
import { Eye, EyeOff, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  intersectsCatalog,
  makeComparator,
  normalizeForMatch,
  paginate,
  type SortDir,
} from "@/components/kit/table-utils";
import { KitTableHeaderBand } from "@/components/kit/kit-table-header-band";
import { ColumnHeader } from "@/components/kit/data-table-filter";
import { ActionsCell } from "@/components/kit/data-table-actions";
import { Paginator } from "@/components/kit/data-table-paginator";

export { ActionsCell } from "@/components/kit/data-table-actions";

export type ColumnFilter =
  | { kind: "none" }
  | { kind: "text" }
  | { kind: "catalog"; options: { value: string; label: string }[] };

export interface ColumnDef<T> {
  /** Sort + filter state id (stable across renders). */
  key: string;
  header: string;
  accessor: (row: T) => string | number | string[];
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  filter?: ColumnFilter;
  className?: string;
}

export interface DataTableProps<T> {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  rows: T[];
  getRowId: (row: T) => string | number;
  columns: ColumnDef<T>[];
  isActive: (row: T) => boolean;
  onAdd?: () => void;
  onEdit?: (row: T) => void;
  onSoftDelete?: (row: T) => Promise<{ error?: string }>;
  onHardDelete?: (row: T) => Promise<{ error?: string }>;
  /** Reactivate an inactive row. Runs on direct click (reversible action, no
   * confirm); shown next to "Eliminar permanentemente" in inactive mode. */
  onRestore?: (row: T) => Promise<{ error?: string }>;
  canEdit?: (row: T) => boolean;
  canDelete?: (row: T) => boolean;
  onAfterChange?: () => void;
  pageSize?: number;
  addLabel?: string;
}

type FilterState = Record<string, string | string[]>;
type SortState = { key: string; dir: SortDir } | null;

/**
 * Generic Administración DataTable. Owns: header band (icon/title/subtitle +
 * add + active/inactive toggle, via `KitTableHeaderBand`), per-column filter
 * popover + sort headers (`data-table-filter.tsx`), body, unlabeled actions
 * column (`data-table-actions.tsx`), internal-scroll layout (sticky
 * thead/footer), and paginator (`data-table-paginator.tsx`). Soft vs hard
 * delete flips on the active/inactive mode.
 *
 * Client-side everything. Catalogs are dozens; users are low hundreds; full-set
 * preloading in the server page is enough (no need for ?page&q&sort endpoints).
 */
export function DataTable<T>({
  icon: Icon,
  title,
  subtitle,
  rows,
  getRowId,
  columns,
  isActive,
  onAdd,
  onEdit,
  onSoftDelete,
  onHardDelete,
  onRestore,
  canEdit,
  canDelete,
  onAfterChange,
  pageSize = 50,
  addLabel = "Nuevo",
}: DataTableProps<T>) {
  const [showInactive, setShowInactiveRaw] = React.useState(false);
  const [filters, setFiltersRaw] = React.useState<FilterState>({});
  const [sort, setSortRaw] = React.useState<SortState>(null);
  const [page, setPage] = React.useState(1);

  // Setters that reset pagination to page 1 whenever a filter / sort / mode
  // changes — kept in event handlers (not effects) so we don't trigger the
  // react-hooks/set-state-in-effect lint.
  function setShowInactive(v: boolean) {
    setShowInactiveRaw(v);
    setPage(1);
  }
  function setFilters(updater: (prev: FilterState) => FilterState) {
    setFiltersRaw(updater);
    setPage(1);
  }
  function setSort(updater: (prev: SortState) => SortState | null) {
    setSortRaw(updater);
    setPage(1);
  }

  // Filter the rowset by the active/inactive mode, then per column.
  const filteredRows = React.useMemo(() => {
    const activeMode = !showInactive;
    let out = rows.filter((row) =>
      activeMode ? isActive(row) : !isActive(row),
    );
    for (const col of columns) {
      const f = col.filter;
      if (!f) continue;
      const v = filters[col.key];
      if (f.kind === "text" && typeof v === "string" && v.trim()) {
        out = out.filter((row) => valueMatchesText(col.accessor(row), v));
      } else if (f.kind === "catalog" && Array.isArray(v) && v.length > 0) {
        out = out.filter((row) => {
          const got = col.accessor(row);
          const vals = Array.isArray(got)
            ? got
            : got == null
              ? []
              : [String(got)];
          return intersectsCatalog(vals, v);
        });
      }
    }
    return out;
  }, [rows, columns, filters, showInactive, isActive]);

  const sortedRows = React.useMemo(() => {
    if (!sort || !sort.dir) return filteredRows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filteredRows;
    const cmp = makeComparator(col.accessor, sort.dir);
    return [...filteredRows].sort(cmp);
  }, [filteredRows, columns, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = React.useMemo(
    () => paginate(sortedRows, safePage, pageSize),
    [sortedRows, safePage, pageSize],
  );

  function cycleSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      if (prev.dir === "desc") return null;
      return { key, dir: "asc" };
    });
  }

  const activeCount = rows.filter((r) => isActive(r)).length;
  const inactiveCount = rows.length - activeCount;

  return (
    <div className="flex flex-col rounded-lg border bg-card">
      <KitTableHeaderBand
        icon={Icon}
        title={title}
        subtitle={subtitle}
        right={
          <>
            <ActiveInactiveToggle
              showInactive={showInactive}
              onChange={setShowInactive}
              activeCount={activeCount}
              inactiveCount={inactiveCount}
            />
            {onAdd ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" onClick={onAdd} aria-label={addLabel}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{addLabel}</TooltipContent>
              </Tooltip>
            ) : null}
          </>
        }
      />

      {/* Table region — the only part that scrolls. */}
      <div className="flex max-h-[calc(100vh-14rem)] flex-col overflow-hidden">
        <Table className="table-fixed">
          <TableHeader className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_var(--border)]">
            <TableRow>
              {columns.map((col) => (
                <ColumnHeader
                  key={col.key}
                  col={col}
                  sort={sort?.key === col.key ? sort.dir : null}
                  onSort={() => cycleSort(col.key)}
                  filterValue={filters[col.key]}
                  onFilterChange={(v) =>
                    setFilters((prev) => {
                      const next = { ...prev };
                      if (v === undefined) delete next[col.key];
                      else next[col.key] = v;
                      return next;
                    })
                  }
                />
              ))}
              <TableHead className="w-20 px-2 text-right" aria-label="Acciones" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + 1}
                  className="text-muted-foreground"
                >
                  No hay registros para mostrar.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => (
                <TableRow key={String(getRowId(row))}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      {col.render
                        ? col.render(row)
                        : renderPrimitive(col.accessor(row))}
                    </TableCell>
                  ))}
                  <TableCell className="px-2">
                    <ActionsCell<T>
                      row={row}
                      isActive={isActive}
                      onEdit={onEdit}
                      onSoftDelete={onSoftDelete}
                      onHardDelete={onHardDelete}
                      onRestore={onRestore}
                      canEdit={canEdit}
                      canDelete={canDelete}
                      onAfterChange={onAfterChange}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Paginator
        page={safePage}
        totalPages={totalPages}
        total={sortedRows.length}
        pageSize={pageSize}
        onChange={setPage}
      />
    </div>
  );
}

/** Activos/Inactivos mode switch — icon-only (Eye = activos, EyeOff =
 * inactivos) with the count beside each icon and the label in a tooltip.
 * Exported for kit tables that share the soft-delete browsing pattern
 * (GroupedDataTable). */
export function ActiveInactiveToggle({
  showInactive,
  onChange,
  activeCount,
  inactiveCount,
}: {
  showInactive: boolean;
  onChange: (v: boolean) => void;
  activeCount: number;
  inactiveCount: number;
}) {
  return (
    <div
      role="tablist"
      className="inline-flex h-9 items-center gap-0.5 rounded-md border bg-card p-0.5 text-xs"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            role="tab"
            aria-selected={!showInactive}
            aria-label={`Activos (${activeCount})`}
            onClick={() => onChange(false)}
            className={cn(
              "flex h-full items-center gap-1.5 rounded-[4px] px-2.5 transition-colors",
              !showInactive
                ? "bg-ezi-gray text-white"
                : "text-muted-foreground hover:bg-gray-100",
            )}
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="tabular-nums">{activeCount}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Activos</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            role="tab"
            aria-selected={showInactive}
            aria-label={`Inactivos (${inactiveCount})`}
            onClick={() => onChange(true)}
            className={cn(
              "flex h-full items-center gap-1.5 rounded-[4px] px-2.5 transition-colors",
              showInactive
                ? "bg-ezi-gray text-white"
                : "text-muted-foreground hover:bg-gray-100",
            )}
          >
            <EyeOff className="h-3.5 w-3.5" />
            <span className="tabular-nums">{inactiveCount}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Inactivos</TooltipContent>
      </Tooltip>
    </div>
  );
}

function renderPrimitive(v: string | number | string[]): React.ReactNode {
  if (Array.isArray(v)) {
    return v.length === 0 ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      v.join(", ")
    );
  }
  if (v === "" || v == null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return v;
}

/** `text` filter predicate against any accessor — string / number / string[]. */
function valueMatchesText(
  accessor: string | number | string[],
  needle: string,
): boolean {
  const n = normalizeForMatch(needle);
  if (!n) return true;
  if (Array.isArray(accessor)) {
    return accessor.some((a) => normalizeForMatch(a).includes(n));
  }
  return normalizeForMatch(accessor).includes(n);
}
