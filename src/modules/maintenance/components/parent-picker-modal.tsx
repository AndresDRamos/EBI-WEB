"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeForMatch } from "@/components/kit/table-utils";
import { cn } from "@/lib/utils";
import type { ParentOption } from "@/modules/maintenance/types";

export interface ParentPickerModalProps {
  choices: ParentOption[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onClose: () => void;
}

/**
 * "Equipo padre" picker — stacked over the equipment modal (same pattern as
 * `QrModal`). Search the catalog on the left; the right side previews the
 * highlighted candidate as a compact, read-only copy of its own equipment
 * summary (photo, identity, categoría/tipo, ubicación) — no edit
 * affordances, no tabs, no Detalles section, since this is just for
 * confirming which asset to assign as parent.
 */
export function ParentPickerModal({
  choices,
  selectedId,
  onSelect,
  onClose,
}: ParentPickerModalProps) {
  const [search, setSearch] = React.useState("");
  const [previewId, setPreviewId] = React.useState<number | null>(selectedId);

  const q = normalizeForMatch(search);
  const matches = q
    ? choices.filter((p) =>
        [p.code, p.name, p.brand ?? "", p.model ?? ""].some((v) =>
          normalizeForMatch(v).includes(q),
        ),
      )
    : choices;
  const preview =
    previewId !== null
      ? (choices.find((p) => p.asset_id === previewId) ?? null)
      : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Buscar equipo padre</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Matrícula, nombre, marca…"
              autoFocus
            />
            <div className="max-h-72 overflow-auto rounded-md border">
              {matches.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">
                  Sin equipos que coincidan.
                </p>
              ) : (
                matches.map((p) => (
                  <button
                    key={p.asset_id}
                    type="button"
                    onClick={() => setPreviewId(p.asset_id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50",
                      previewId === p.asset_id && "bg-orange-50",
                    )}
                  >
                    <span className="font-mono text-[11px] font-semibold text-muted-foreground">
                      {p.code}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col">
            {preview ? (
              <ParentPreview asset={preview} />
            ) : (
              <div className="flex h-full min-h-40 items-center justify-center rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                Selecciona un equipo para ver su ficha.
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!preview}
            onClick={() => {
              if (preview) onSelect(preview.asset_id);
              onClose();
            }}
          >
            Seleccionar como padre
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Compact, read-only rendering of an equipment's summary — mirrors the main
 * equipment modal's identity + Ubicación sections, minus Detalles, tabs and
 * any edit affordance. */
function ParentPreview({ asset }: { asset: ParentOption }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-gray-50/60 p-4">
      <div className="flex gap-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-white">
          {asset.has_image ? (
            // eslint-disable-next-line @next/next/no-img-element -- SAS-redirect URL, not optimizable
            <img
              src={`/api/maintenance/assets/${asset.asset_id}/image`}
              alt={`Imagen de ${asset.name}`}
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight text-ezi-gray">
            {asset.name}
          </p>
          <p className="font-mono text-xs text-muted-foreground">{asset.code}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {asset.type_name ? <Badge variant="outline">{asset.type_name}</Badge> : null}
            {asset.category_name ? (
              <Badge variant="outline">{asset.category_name}</Badge>
            ) : null}
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <PreviewField label="Marca" value={asset.brand} />
        <PreviewField label="Modelo" value={asset.model} />
        <PreviewField label="Serie" value={asset.serial_number} />
        <PreviewField label="Planta" value={asset.plant_name} />
        <PreviewField label="Ubicación" value={asset.location_name} />
        <PreviewField
          label="Celda"
          value={asset.cell_names.length > 0 ? asset.cell_names.join(", ") : null}
        />
      </dl>
    </div>
  );
}

function PreviewField({ label, value }: { label: string; value: string | null }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate">
        {value ? value : <span className="text-muted-foreground">—</span>}
      </dd>
    </>
  );
}
