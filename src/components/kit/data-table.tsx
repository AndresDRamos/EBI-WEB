"use client";

import * as React from "react";
import {
  ArrowDownUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
  Eye,
  EyeOff,
  Filter,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  intersectsCatalog,
  makeComparator,
  normalizeForMatch,
  paginate,
  type SortDir,
} from "@/components/kit/table-utils";

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
  onSoftDelete?: (row: T) => Promise<{ ok?: boolean; error?: string }>;
  onHardDelete?: (row: T) => Promise<{ ok?: boolean; error?: string }>;
  /** Reactivate an inactive row. Runs on direct click (reversible action, no
   * confirm); shown next to "Eliminar permanentemente" in inactive mode. */
  onRestore?: (row: T) => Promise<{ ok?: boolean; error?: string }>;
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
 * add + active/inactive toggle), per-column filter popover + sort headers,
 * body, unlabeled actions column, internal-scroll layout (sticky thead/footer),
 * and 50/page paginator. Soft vs hard delete flips on the active/inactive mode
 * and routes through `AlertDialog` with inline 409 errors.
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
      {/* Header band — outside the scroll region. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="flex items-center gap-3">
          {Icon ? <Icon className="h-5 w-5 text-ezi-orange" /> : null}
          <div>
            <h2 className="font-semibold leading-tight">{title}</h2>
            {subtitle ? (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ColumnHeader<T>({
  col,
  sort,
  onSort,
  filterValue,
  onFilterChange,
}: {
  col: ColumnDef<T>;
  sort: SortDir;
  onSort: () => void;
  filterValue: string | string[] | undefined;
  onFilterChange: (v: string | string[] | undefined) => void;
}) {
  const sortable = col.sortable !== false; // default true
  const filter = col.filter;
  const filterActive =
    filter?.kind === "text"
      ? typeof filterValue === "string" && filterValue.trim() !== ""
      : filter?.kind === "catalog"
        ? Array.isArray(filterValue) && filterValue.length > 0
        : false;

  return (
    <TableHead className={col.className}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onSort}
          disabled={!sortable}
          className={cn(
            "inline-flex items-center gap-1 rounded-sm px-1 text-xs font-semibold uppercase tracking-wide",
            !sortable && "cursor-default",
            sortable && "hover:bg-gray-200",
          )}
          aria-label={`Ordenar por ${col.header}`}
        >
          {col.header}
          {sortable ? <SortArrow dir={sort} /> : null}
        </button>
        {filter && filter.kind !== "none" ? (
          <FilterButton
            col={col}
            value={filterValue}
            onChange={onFilterChange}
            active={filterActive}
          />
        ) : null}
      </div>
    </TableHead>
  );
}

function SortArrow({ dir }: { dir: SortDir }) {
  if (!dir) return <ArrowDownUp className="h-3 w-3 opacity-50" />;
  return dir === "asc" ? (
    <ChevronUp className="h-3 w-3" />
  ) : (
    <ChevronDown className="h-3 w-3" />
  );
}

function FilterButton<T>({
  col,
  value,
  onChange,
  active,
}: {
  col: ColumnDef<T>;
  value: string | string[] | undefined;
  onChange: (v: string | string[] | undefined) => void;
  active: boolean;
}) {
  const filter = col.filter;
  const text =
    filter?.kind === "text" ? (typeof value === "string" ? value : "") : "";
  const selected: string[] =
    filter?.kind === "catalog" && Array.isArray(value) ? value : [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-sm transition-colors",
            active
              ? "bg-orange-100 text-ezi-orange"
              : "text-muted-foreground hover:bg-gray-200",
          )}
          aria-label={`Filtrar ${col.header}`}
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        {filter?.kind === "text" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Filtrar “{col.header}”
              </span>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onChange(undefined)}
              >
                Limpiar
              </button>
            </div>
            <Input
              value={text}
              autoFocus
              placeholder="Buscar…"
              onChange={(e) => onChange(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Sin distinción de mayúsculas ni acentos.
            </p>
          </div>
        ) : filter?.kind === "catalog" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Filtrar “{col.header}”
              </span>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onChange(undefined)}
              >
                Limpiar
              </button>
            </div>
            <div className="max-h-56 overflow-auto rounded-sm border bg-white">
              {filter.options.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">Sin opciones.</p>
              ) : (
                filter.options.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-start gap-2 px-2 py-1.5 text-sm hover:bg-gray-50"
                  >
                    <Checkbox
                      checked={selected.includes(opt.value)}
                      onCheckedChange={(checked) => {
                        if (checked) onChange([...selected, opt.value]);
                        else
                          onChange(selected.filter((v) => v !== opt.value));
                      }}
                      className="mt-0.5"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))
              )}
            </div>
            {selected.length > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                {selected.length} seleccionado
                {selected.length === 1 ? "" : "s"}.
              </p>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** Row actions (edit / soft-hard delete / restore) + confirm dialogs. Exported
 * for kit tables that share the row-action contract (GroupedDataTable). */
export function ActionsCell<T>({
  row,
  isActive,
  onEdit,
  onSoftDelete,
  onHardDelete,
  onRestore,
  canEdit,
  canDelete,
  onAfterChange,
}: {
  row: T;
  isActive: (row: T) => boolean;
  onEdit?: (row: T) => void;
  onSoftDelete?: (row: T) => Promise<{ ok?: boolean; error?: string }>;
  onHardDelete?: (row: T) => Promise<{ ok?: boolean; error?: string }>;
  onRestore?: (row: T) => Promise<{ ok?: boolean; error?: string }>;
  canEdit?: (row: T) => boolean;
  canDelete?: (row: T) => boolean;
  onAfterChange?: () => void;
}) {
  const active = isActive(row);
  const canEditRow = canEdit ? canEdit(row) : true;
  const canDeleteRow = canDelete ? canDelete(row) : true;
  const editDisabled = !onEdit || !canEditRow;
  // The trash is offered in active mode when soft-delete handler exists, and in
  // inactive mode when hard-delete handler exists.
  const hasDeleteHandler = active ? Boolean(onSoftDelete) : Boolean(onHardDelete);
  const deleteDisabled = !hasDeleteHandler || !canDeleteRow;
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Restore runs on direct click (reversible — no confirm); the dialog below
  // is only used to surface a failure.
  const [restoreBusy, setRestoreBusy] = React.useState(false);
  const [restoreError, setRestoreError] = React.useState<string | null>(null);

  async function doRestore() {
    if (!onRestore) return;
    setRestoreBusy(true);
    let res: { ok?: boolean; error?: string };
    try {
      res = await onRestore(row);
    } catch {
      res = { error: "No se pudo completar la acción." };
    }
    setRestoreBusy(false);
    if (res && res.error) {
      setRestoreError(res.error);
      return;
    }
    onAfterChange?.();
  }

  async function confirmDelete() {
    setError(null);
    setBusy(true);
    const handler = active ? onSoftDelete : onHardDelete;
    if (!handler) {
      setBusy(false);
      setDialogOpen(false);
      return;
    }
    let res: { ok?: boolean; error?: string };
    try {
      res = await handler(row);
    } catch {
      res = { error: "No se pudo completar la acción." };
    }
    setBusy(false);
    if (res && res.error) {
      setError(res.error);
      return;
    }
    setDialogOpen(false);
    onAfterChange?.();
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={editDisabled}
              onClick={() => onEdit?.(row)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-gray-100 hover:text-ezi-gray disabled:pointer-events-none disabled:opacity-40"
              aria-label="Editar"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Editar</TooltipContent>
        </Tooltip>
        {!active && onRestore ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={restoreBusy}
                onClick={() => void doRestore()}
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-green-50 hover:text-green-700 disabled:pointer-events-none disabled:opacity-40"
                aria-label="Reactivar"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Reactivar</TooltipContent>
          </Tooltip>
        ) : null}
        {!deleteDisabled ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setDialogOpen(true);
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-orange-50 hover:text-ezi-orange disabled:pointer-events-none disabled:opacity-40"
                aria-label={active ? "Desactivar" : "Eliminar permanentemente"}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {active ? "Desactivar" : "Eliminar permanentemente"}
            </TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex h-7 w-7 cursor-not-allowed items-center justify-center rounded-sm text-muted-foreground opacity-40">
                <Trash2 className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">No se puede eliminar</TooltipContent>
          </Tooltip>
        )}
      </div>

      <AlertDialog
        open={restoreError !== null}
        onOpenChange={(o) => {
          if (!o) setRestoreError(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No se pudo reactivar</AlertDialogTitle>
            <AlertDialogDescription>{restoreError}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cerrar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setError(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {active ? "¿Desactivar el registro?" : "¿Eliminar permanentemente el registro?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {active
                ? "El registro se marcará como inactivo. Podrás reactivarlo o eliminarlo después."
                : "Esta acción no se puede deshacer. Si el registro está referenciado por otros (por usuarios), se bloqueará."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={busy}
              className={active ? "bg-ezi-orange" : undefined}
            >
              {busy ? "Procesando…" : active ? "Desactivar" : "Eliminar permanentemente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Paginator({
  page,
  totalPages,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (n: number) => void;
}) {
  if (total === 0) {
    return (
      <div className="border-t p-3 text-xs text-muted-foreground">
        Sin registros.
      </div>
    );
  }
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const canPrev = page > 1;
  const canNext = page < totalPages;
  const first = 1;
  const last = totalPages === 0 ? 1 : totalPages;
  const flip = (n: number, allowed: boolean) => (allowed ? onChange(n) : undefined);
  return (
    <div className="flex items-center justify-between gap-2 border-t p-3">
      <p className="text-xs text-muted-foreground">
        {start}–{end} de {total}
      </p>
      <div className="flex items-center gap-1">
        <a
          className={cn(
            buttonVariants({ size: "icon", variant: "ghost" }),
            !canPrev && "pointer-events-none opacity-40",
          )}
          role="button"
          tabIndex={canPrev ? 0 : -1}
          aria-disabled={!canPrev}
          aria-label="Primera página"
          onClick={() => flip(first, canPrev)}
        >
          <ChevronsLeft className="h-4 w-4" />
        </a>
        <a
          className={cn(
            buttonVariants({ size: "icon", variant: "ghost" }),
            !canPrev && "pointer-events-none opacity-40",
          )}
          role="button"
          tabIndex={canPrev ? 0 : -1}
          aria-disabled={!canPrev}
          aria-label="Página anterior"
          onClick={() => flip(page - 1, canPrev)}
        >
          <ChevronLeft className="h-4 w-4" />
        </a>
        <span className="px-2 text-xs tabular-nums">
          {page} / {totalPages === 0 ? 1 : totalPages}
        </span>
        <a
          className={cn(
            buttonVariants({ size: "icon", variant: "ghost" }),
            !canNext && "pointer-events-none opacity-40",
          )}
          role="button"
          tabIndex={canNext ? 0 : -1}
          aria-disabled={!canNext}
          aria-label="Página siguiente"
          onClick={() => flip(page + 1, canNext)}
        >
          <ChevronRight className="h-4 w-4" />
        </a>
        <a
          className={cn(
            buttonVariants({ size: "icon", variant: "ghost" }),
            !canNext && "pointer-events-none opacity-40",
          )}
          role="button"
          tabIndex={canNext ? 0 : -1}
          aria-disabled={!canNext}
          aria-label="Última página"
          onClick={() => flip(last, canNext)}
        >
          <ChevronsRight className="h-4 w-4" />
        </a>
      </div>
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
      className="inline-flex items-center rounded-md border bg-card p-0.5 text-xs"
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
              "flex items-center gap-1.5 rounded-[4px] px-2.5 py-1 transition-colors",
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
              "flex items-center gap-1.5 rounded-[4px] px-2.5 py-1 transition-colors",
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