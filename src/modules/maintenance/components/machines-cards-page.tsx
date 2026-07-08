"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  SearchX,
  X,
} from "lucide-react";
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
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { cn } from "@/lib/utils";
import { ActiveInactiveToggle } from "@/components/kit/data-table";
import { normalizeForMatch } from "@/components/kit/table-utils";
import { useCan } from "@/components/providers/permissions-provider";
import {
  MachineFormDialog,
  type MachineFormAsset,
  type PlantOption,
  type TypeOption,
  type ProcessOption,
  type ParentOption,
} from "@/modules/maintenance/components/machine-form-dialog";
import { MachineCardsGrid } from "@/modules/maintenance/components/machine-cards";

export interface MachineRow {
  asset_id: number;
  code: string;
  name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  plant_id: number;
  plant_name: string;
  status: string;
  asset_type_id: number;
  type_name: string;
  category_name: string;
  parent_asset_id: number | null;
  installation_date: string | null;
  image_blob_path: string | null;
  notes: string | null;
  process_names: string[];
  process_ids: number[];
  cell_names: string[];
  is_active: boolean;
}

interface Filters {
  search: string;
  plants: string[];
  categories: string[];
}

const EMPTY_FILTERS: Filters = { search: "", plants: [], categories: [] };
const PAGE_SIZE = 24;

/** Groups up to 3 values into one summary label ("A, B, C, etc." beyond that). */
function concatLabels(values: string[]): string {
  return values.slice(0, 3).join(", ") + (values.length > 3 ? ", etc." : "");
}

/**
 * Equipos as a full-page cards catalog (design source: `design/Equipos.dc.html`
 * in the Claude Design project). Three stacked regions filling the page's
 * content area — header + filters (fixed), cards grid (scrolls), pagination
 * (fixed) — no boxed card wrapper. Only active assets show by default; the
 * kit `ActiveInactiveToggle` switches to inactive ones.
 */
export function MachinesCardsPage({
  machines,
  plants,
  types,
  processes,
}: {
  machines: MachineRow[];
  plants: PlantOption[];
  types: TypeOption[];
  processes: ProcessOption[];
}) {
  const can = useCan();
  const router = useRouter();
  const [modal, setModal] = React.useState<{
    open: boolean;
    edit: MachineFormAsset | null;
  }>({ open: false, edit: null });
  const [filters, setFiltersRaw] = React.useState<Filters>(EMPTY_FILTERS);
  const [showInactive, setShowInactiveRaw] = React.useState(false);
  const [page, setPage] = React.useState(1);
  // Right-click "Desactivar" confirm flow.
  const [confirmRow, setConfirmRow] = React.useState<MachineRow | null>(null);
  const [confirmBusy, setConfirmBusy] = React.useState(false);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);

  function setFilters(f: Filters) {
    setFiltersRaw(f);
    setPage(1);
  }
  function setShowInactive(v: boolean) {
    setShowInactiveRaw(v);
    setPage(1);
  }

  async function deactivate(row: MachineRow) {
    setConfirmError(null);
    setConfirmBusy(true);
    let error: string | null = null;
    try {
      const res = await fetch(`/api/maintenance/assets/${row.asset_id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        error = d.error ?? "No se pudo desactivar el equipo.";
      }
    } catch {
      error = "No se pudo completar la acción.";
    }
    setConfirmBusy(false);
    if (error) {
      setConfirmError(error);
      return;
    }
    setConfirmRow(null);
    // Let the dialog finish closing (and unlock the body) before the RSC
    // re-render — refreshing in the same tick can strand its scroll lock.
    setTimeout(() => router.refresh(), 0);
  }

  /** Reversible, so it runs on direct click without a confirm dialog. */
  async function restore(row: MachineRow) {
    await fetch(`/api/maintenance/assets/${row.asset_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    }).catch(() => undefined);
    router.refresh();
  }

  const activeCount = machines.filter((m) => m.is_active).length;
  const inactiveCount = machines.length - activeCount;
  const visible = machines.filter((m) =>
    showInactive ? !m.is_active : m.is_active,
  );

  const plantOptions = [...new Set(visible.map((m) => m.plant_name))].map(
    (name) => ({ value: name, label: name }),
  );
  const categoryOptions = [...new Set(visible.map((m) => m.category_name))]
    .filter(Boolean)
    .map((c) => ({ value: c, label: c }));

  const filtered = React.useMemo(() => {
    let out = visible;
    const q = normalizeForMatch(filters.search);
    if (q) {
      out = out.filter((m) =>
        [m.code, m.name, m.brand ?? "", m.model ?? "", m.serial_number ?? ""]
          .some((v) => normalizeForMatch(v).includes(q)),
      );
    }
    if (filters.plants.length > 0) {
      out = out.filter((m) => filters.plants.includes(m.plant_name));
    }
    if (filters.categories.length > 0) {
      out = out.filter((m) => filters.categories.includes(m.category_name));
    }
    return out;
  }, [visible, filters]);

  const activeFilterCount =
    (filters.search.trim() ? 1 : 0) +
    (filters.plants.length > 0 ? 1 : 0) +
    (filters.categories.length > 0 ? 1 : 0);

  const filterChips = React.useMemo(() => {
    const chips: { kind: string; label: string; clear: () => void }[] = [];
    if (filters.search.trim()) {
      chips.push({
        kind: "Buscar",
        label: `"${filters.search.trim()}"`,
        clear: () => setFilters({ ...filters, search: "" }),
      });
    }
    if (filters.plants.length > 0) {
      chips.push({
        kind: filters.plants.length > 1 ? "Plantas" : "Planta",
        label: concatLabels(filters.plants),
        clear: () => setFilters({ ...filters, plants: [] }),
      });
    }
    if (filters.categories.length > 0) {
      chips.push({
        kind: filters.categories.length > 1 ? "Categorías" : "Categoría",
        label: concatLabels(filters.categories),
        clear: () => setFilters({ ...filters, categories: [] }),
      });
    }
    return chips;
  }, [filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = filtered.length ? (safePage - 1) * PAGE_SIZE : 0;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  const parentOptions: ParentOption[] = machines
    .filter((m) => m.is_active)
    .map((m) => ({
      asset_id: m.asset_id,
      code: m.code,
      name: m.name,
      brand: m.brand,
      model: m.model,
      serial_number: m.serial_number,
      plant_name: m.plant_name,
      type_name: m.type_name,
      has_image: m.image_blob_path !== null,
    }));

  return (
    <div className="flex h-full flex-col">
      {/* Header — title, total count, add action. Not boxed. */}
      <div className="flex flex-shrink-0 flex-wrap items-end justify-between gap-4 pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ezi-gray">
            Equipos
          </h1>
        </div>
        <div className="flex items-center gap-4 pb-0.5">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Boxes className="h-4 w-4" />
            <span>
              <strong className="font-bold text-ezi-gray">{activeCount}</strong>{" "}
              equipos en planta
            </span>
          </span>
          {can("maintenance.asset:create") ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  className="w-8 px-0"
                  onClick={() => setModal({ open: true, edit: null })}
                  aria-label="Nuevo equipo"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Nuevo equipo</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>

      {/* Filters row — pill + inline applied chips + results count. */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b pb-4">
        <ActiveInactiveToggle
          showInactive={showInactive}
          onChange={setShowInactive}
          activeCount={activeCount}
          inactiveCount={inactiveCount}
        />
        <FiltersButton
          filters={filters}
          onChange={setFilters}
          activeCount={activeFilterCount}
          plantOptions={plantOptions}
          categoryOptions={categoryOptions}
        />

        {filterChips.length > 0 ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {filterChips.map((chip) => (
              <span
                key={chip.kind}
                className="inline-flex items-center gap-1.5 rounded-full border bg-card py-1 pl-3 pr-1 text-xs"
              >
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {chip.kind}
                </span>
                <span className="font-medium">{chip.label}</span>
                <button
                  type="button"
                  onClick={chip.clear}
                  title="Quitar filtro"
                  className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-muted-foreground hover:bg-orange-50 hover:text-ezi-orange"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <span className="min-w-0 flex-1 select-none text-xs text-muted-foreground">
            Sin filtros activos
          </span>
        )}

        <div className="ml-auto flex flex-shrink-0 items-center gap-3.5">
          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="text-xs font-semibold text-ezi-orange hover:text-orange-700"
            >
              Limpiar
            </button>
          ) : null}
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {filtered.length} resultados
          </span>
        </div>
      </div>

      {/* Cards grid — the only region that scrolls. */}
      <div className="flex-1 overflow-y-auto py-4">
        {pageItems.length === 0 && activeFilterCount > 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-16 text-center text-muted-foreground">
            <SearchX className="h-10 w-10 text-gray-300" />
            <p className="mt-2 text-sm font-semibold text-ezi-gray">
              No se encontraron equipos
            </p>
            <p className="text-xs">
              Ajuste o limpie los filtros para ver más resultados.
            </p>
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "mt-3",
              )}
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <MachineCardsGrid
            machines={pageItems}
            onEdit={
              can("maintenance.asset:update")
                ? (m) => setModal({ open: true, edit: m })
                : undefined
            }
            onDeactivate={
              can("maintenance.asset:delete")
                ? (m) => {
                    setConfirmError(null);
                    setConfirmRow(m);
                  }
                : undefined
            }
            onRestore={
              can("maintenance.asset:update")
                ? (m) => void restore(m)
                : undefined
            }
          />
        )}
      </div>

      {/* Pagination — fixed at the bottom of the page content area. */}
      <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t pt-3">
        <span className="text-xs text-muted-foreground">
          Mostrando {filtered.length ? `${start + 1}–${start + pageItems.length}` : 0}{" "}
          de {filtered.length}
        </span>
        <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
      </div>

      <MachineFormDialog
        open={modal.open}
        asset={modal.edit}
        plants={plants}
        types={types}
        processes={processes}
        parents={parentOptions}
        onOpenChange={(open) =>
          setModal((prev) => ({ open, edit: open ? prev.edit : null }))
        }
        onSaved={() => {
          setModal({ open: false, edit: null });
          router.refresh();
        }}
      />
      <AlertDialog
        open={confirmRow !== null}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmRow(null);
            setConfirmError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar el equipo?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRow
                ? `${confirmRow.code} — ${confirmRow.name} se marcará como inactivo. Podrás reactivarlo después.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmError ? (
            <p className="text-sm text-destructive" role="alert">
              {confirmError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-ezi-orange"
              disabled={confirmBusy}
              onClick={(e) => {
                e.preventDefault();
                if (confirmRow) void deactivate(confirmRow);
              }}
            >
              {confirmBusy ? "Procesando…" : "Desactivar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FiltersButton({
  filters,
  onChange,
  activeCount,
  plantOptions,
  categoryOptions,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  activeCount: number;
  plantOptions: { value: string; label: string }[];
  categoryOptions: { value: string; label: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex flex-shrink-0 items-center gap-2 rounded-lg border bg-card px-3 py-2 text-[13px] font-semibold text-ezi-gray shadow-sm transition-colors",
            (open || activeCount > 0) && "border-ezi-orange/50",
          )}
        >
          <span className="relative inline-flex items-center justify-center">
            <Filter
              className={cn(
                "h-4 w-4",
                open || activeCount > 0 ? "text-ezi-orange" : "text-gray-500",
              )}
            />
            {activeCount > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-ezi-orange px-0.5 text-[9px] font-bold leading-none text-white ring-2 ring-white">
                {activeCount}
              </span>
            ) : null}
          </span>
          Filtros
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Filtros
          </span>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onChange(EMPTY_FILTERS)}
          >
            Limpiar
          </button>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="machines-search">
            Buscar
          </label>
          <Input
            id="machines-search"
            value={filters.search}
            placeholder="Código, nombre, marca, modelo, serie…"
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
          />
        </div>
        <CatalogFilter
          label="Planta"
          options={plantOptions}
          selected={filters.plants}
          onChange={(plants) => onChange({ ...filters, plants })}
        />
        <CatalogFilter
          label="Categoría"
          options={categoryOptions}
          selected={filters.categories}
          onChange={(categories) => onChange({ ...filters, categories })}
        />
      </PopoverContent>
    </Popover>
  );
}

function CatalogFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="max-h-40 overflow-auto rounded-sm border bg-white">
        {options.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">Sin opciones.</p>
        ) : (
          options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-start gap-2 px-2 py-1.5 text-sm hover:bg-gray-50"
            >
              <Checkbox
                checked={selected.includes(opt.value)}
                onCheckedChange={(checked) => {
                  if (checked) onChange([...selected, opt.value]);
                  else onChange(selected.filter((v) => v !== opt.value));
                }}
                className="mt-0.5"
              />
              <span>{opt.label}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

/** Prev/next + numbered pages with ellipsis for far-apart pages. */
function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (n: number) => void;
}) {
  const near = new Set([1, totalPages, page, page - 1, page + 1]);
  const items: { n: number; gap: boolean }[] = [];
  let prev = 0;
  for (let n = 1; n <= totalPages; n++) {
    if (!near.has(n)) continue;
    if (prev && n - prev > 1) items.push({ n: -prev - n, gap: true });
    items.push({ n, gap: false });
    prev = n;
  }
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={prevDisabled}
        onClick={() => onChange(Math.max(1, page - 1))}
        aria-label="Página anterior"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-card text-muted-foreground disabled:cursor-default disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {items.map((it) =>
        it.gap ? (
          <span
            key={it.n}
            className="min-w-[22px] select-none text-center text-sm text-gray-300"
          >
            …
          </span>
        ) : (
          <button
            key={it.n}
            type="button"
            onClick={() => onChange(it.n)}
            className={cn(
              "h-8 min-w-8 rounded-md border px-2 text-[13px] font-medium",
              it.n === page
                ? "border-ezi-orange bg-ezi-orange text-white"
                : "bg-card text-ezi-gray hover:bg-gray-50",
            )}
          >
            {it.n}
          </button>
        ),
      )}
      <button
        type="button"
        disabled={nextDisabled}
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        aria-label="Página siguiente"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-card text-muted-foreground disabled:cursor-default disabled:opacity-40"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
