"use client";

import * as React from "react";
import { CheckCircle2, CircleOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Asset palette for the placement editor: the plant's assets with footprint
 * state. Click-to-arm placement (robust with SVG, unlike HTML5 drag & drop):
 * selecting an asset arms it; the editor places it on the next canvas click.
 */

export interface PaletteAsset {
  asset_id: number;
  code: string;
  name: string;
  has_footprint: boolean;
  placed: boolean;
}

export interface LayoutPaletteProps {
  assets: PaletteAsset[];
  armedAssetId: number | null;
  onArm: (assetId: number | null) => void;
  disabled?: boolean;
}

export function LayoutPalette({
  assets,
  armedAssetId,
  onArm,
  disabled = false,
}: LayoutPaletteProps) {
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const visible = assets.filter(
    (a) =>
      !q ||
      a.code.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q),
  );

  return (
    <div className="flex h-full flex-col gap-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar equipo…"
        aria-label="Buscar equipo"
      />
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {visible.map((a) => {
          const armed = a.asset_id === armedAssetId;
          const placeable = a.has_footprint && !a.placed && !disabled;
          return (
            <button
              key={a.asset_id}
              type="button"
              onClick={() => placeable && onArm(armed ? null : a.asset_id)}
              disabled={!placeable}
              className={cn(
                "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors",
                armed
                  ? "border-[#ff5c35] bg-[#ff5c35]/10"
                  : "border-border bg-background",
                placeable
                  ? "hover:border-[#ff5c35]/50"
                  : "cursor-not-allowed opacity-50",
              )}
            >
              {a.has_footprint ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <CircleOff className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0">
                <span className="font-mono text-xs">{a.code}</span>{" "}
                <span className="block truncate text-xs text-muted-foreground">
                  {a.name}
                </span>
              </span>
              {a.placed ? (
                <span className="ml-auto shrink-0 text-[10px] uppercase text-muted-foreground">
                  colocado
                </span>
              ) : !a.has_footprint ? (
                <span className="ml-auto shrink-0 text-[10px] uppercase text-muted-foreground">
                  sin huella
                </span>
              ) : null}
            </button>
          );
        })}
        {visible.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            Sin equipos que coincidan.
          </p>
        ) : null}
      </div>
      {armedAssetId !== null ? (
        <p className="rounded-md bg-[#ff5c35]/10 px-2 py-1.5 text-xs text-[#b23c1f]">
          Haz clic en el plano para colocar el equipo (Esc cancela).
        </p>
      ) : (
        <p className="px-2 text-xs text-muted-foreground">
          Los equipos sin huella se registran en “Huellas de equipo”.
        </p>
      )}
    </div>
  );
}
