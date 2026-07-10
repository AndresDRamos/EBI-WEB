import * as React from "react";
import { cn } from "@/lib/utils";

export interface SectionHeaderProps {
  icon: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** "page" (default) — `items-center`, `h-5 w-5` icon, `text-lg` title.
   * "panel" — `items-start`, bordered panel header (`border-b p-4`),
   * smaller/tighter title, used for the permission-manager-style side panels. */
  variant?: "page" | "panel";
  as?: "h1" | "h2";
  className?: string;
}

/** Shared "icon + title + muted subtitle" section header — replaces the
 * hand-built div copy-pasted across page/panel headers. */
export function SectionHeader({
  icon: Icon,
  title,
  description,
  variant = "page",
  as: Tag = "h2",
  className,
}: SectionHeaderProps) {
  if (variant === "panel") {
    return (
      <div className={cn("flex items-start gap-2.5 border-b p-4", className)}>
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-ezi-orange" />
        <div className="min-w-0">
          <Tag className="text-[15px] font-semibold leading-tight">{title}</Tag>
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Icon className="h-5 w-5 text-ezi-orange" />
      <div>
        <Tag className="text-lg font-semibold">{title}</Tag>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
