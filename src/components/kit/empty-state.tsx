import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** "block" (default) — centered placeholder with generous vertical
   * padding, for a page/section with nothing to show. "inline" — a single
   * muted line, for a compact list/panel that just needs a one-liner. */
  variant?: "block" | "inline";
  className?: string;
}

/** Shared "nothing to show" placeholder — replaces the ad hoc muted-text
 * divs copy-pasted per page (with or without an icon/CTA). */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "block",
  className,
}: EmptyStateProps) {
  if (variant === "inline") {
    return <p className={cn("text-sm text-muted-foreground", className)}>{title}</p>;
  }
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1 py-16 text-center text-muted-foreground",
        className,
      )}
    >
      {Icon ? <Icon className="h-10 w-10 text-gray-300" /> : null}
      <p className="mt-2 text-sm font-semibold text-ezi-gray">{title}</p>
      {description ? <p className="text-xs">{description}</p> : null}
      {action}
    </div>
  );
}
