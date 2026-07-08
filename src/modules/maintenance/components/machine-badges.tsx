"use client";

import { Badge } from "@/components/ui/badge";
import { statusLabel } from "@/modules/maintenance/enums";

export function StatusBadge({ value }: { value: string }) {
  const tone =
    value === "active"
      ? "border-green-200 bg-green-50 text-green-700"
      : value === "in_repair"
        ? "border-orange-200 bg-orange-50 text-ezi-orange"
        : value === "standby"
          ? "border-gray-200 bg-gray-50 text-gray-600"
          : "border-gray-300 bg-gray-100 text-gray-500";
  return (
    <Badge variant="outline" className={tone}>
      {statusLabel(value)}
    </Badge>
  );
}
