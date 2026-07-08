"use client";

import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type EntityCardStatusTone = "ok" | "warn" | "off";

const STATUS_DOT: Record<EntityCardStatusTone, string> = {
  ok: "bg-green-500",
  warn: "bg-ezi-orange",
  off: "bg-gray-400",
};

/** Live-state indicator (dot + label), e.g. connectivity: "Sin conexión". */
export interface EntityCardStatus {
  label: string;
  tone: EntityCardStatusTone;
}

export interface EntityCardBadge {
  label: string;
  className?: string;
}

export interface EntityCardDetail {
  label: string;
  /** Nullish / empty values render as "—". */
  value: React.ReactNode;
}

/** Footer location item (plant, cell, area…). */
export interface EntityCardLocation {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

export interface EntityCardProps {
  /** Business identifier, rendered in mono (e.g. the asset QR code). */
  code: string;
  title: string;
  status?: EntityCardStatus;
  badges?: EntityCardBadge[];
  details?: EntityCardDetail[];
  locations?: EntityCardLocation[];
  /** When set, the whole card is a link. */
  href?: string;
  /** Dims the card (soft-deleted rows). */
  inactive?: boolean;
  className?: string;
}

/**
 * Generic entity card for catalog grids (design source: Equipos card in the
 * Claude Design project, `design/` workflow). Layout: code + status dot on
 * top, title, badges, a label/value detail list, and a location footer.
 * Domain modules map their rows to these props — no domain knowledge here.
 */
export function EntityCard({
  code,
  title,
  status,
  badges = [],
  details = [],
  locations = [],
  href,
  inactive = false,
  className,
}: EntityCardProps) {
  const body = (
    <div
      className={cn(
        "flex h-full flex-col rounded-lg border bg-card p-4 transition-[box-shadow,border-color]",
        href && "hover:border-gray-300 hover:shadow-md",
        inactive && "opacity-60",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="rounded border bg-gray-50 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-muted-foreground">
          {code}
        </span>
        {status ? (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={cn("h-2 w-2 rounded-full", STATUS_DOT[status.tone])}
              aria-hidden
            />
            {status.label}
          </span>
        ) : null}
      </div>

      <h3 className="mt-1 font-semibold leading-tight text-ezi-gray">
        {title}
      </h3>

      {badges.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {badges.map((b) => (
            <Badge key={b.label} variant="outline" className={b.className}>
              {b.label}
            </Badge>
          ))}
        </div>
      ) : null}

      {details.length > 0 ? (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {details.map((d) => (
            <React.Fragment key={d.label}>
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd className="truncate">
                {d.value == null || d.value === "" ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  d.value
                )}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}

      {locations.length > 0 ? (
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 pt-3 text-xs text-muted-foreground [&:not(:first-child)]:mt-3">
          {locations.map((loc) => (
            <span key={loc.label} className="flex items-center gap-1.5">
              <loc.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{loc.label}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {body}
      </Link>
    );
  }
  return body;
}

/** Responsive grid wrapper for `EntityCard`s. */
export function EntityCardGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
