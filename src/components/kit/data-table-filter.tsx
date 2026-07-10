"use client";

import * as React from "react";
import { ArrowDownUp, ChevronDown, ChevronUp, Filter } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SortDir } from "@/components/kit/table-utils";
import type { ColumnDef } from "@/components/kit/data-table";

export function ColumnHeader<T>({
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

export function SortArrow({ dir }: { dir: SortDir }) {
  if (!dir) return <ArrowDownUp className="h-3 w-3 opacity-50" />;
  return dir === "asc" ? (
    <ChevronUp className="h-3 w-3" />
  ) : (
    <ChevronDown className="h-3 w-3" />
  );
}

export function FilterButton<T>({
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
                        else onChange(selected.filter((v) => v !== opt.value));
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
