import * as React from "react";

/** Shared header band (icon + title/subtitle + right-aligned actions) —
 * identical between `DataTable` and `GroupedDataTable`, just with a
 * different set of right-side controls passed in as `right`. */
export function KitTableHeaderBand({
  icon: Icon,
  title,
  subtitle,
  right,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
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
      <div className="flex items-center gap-2">{right}</div>
    </div>
  );
}
