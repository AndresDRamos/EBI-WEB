"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Paginator({
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
