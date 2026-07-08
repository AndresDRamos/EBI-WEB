"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeForMatch } from "@/components/kit/table-utils";
import { cn } from "@/lib/utils";

export interface PlantOption {
  plant_id: number;
  name: string;
}

/** Asset type option with its parent category (for the grouped select). */
export interface TypeOption {
  asset_type_id: number;
  name: string;
  asset_category_id: number;
  category_name: string;
}

export interface ProcessOption {
  process_id: number;
  code: string;
  name: string;
}

/** Candidate parent assets, with enough data to render the read-only preview. */
export interface ParentOption {
  asset_id: number;
  code: string;
  name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  plant_name: string;
  type_name: string;
  has_image: boolean;
}

/** Subset of asset fields the equipment modal edits (create + edit share the same state). */
export interface MachineFormAsset {
  asset_id: number;
  /** Auto-generated matrícula — display-only, never edited by the client. */
  code: string;
  name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  plant_id: number;
  status: string;
  asset_type_id: number;
  parent_asset_id: number | null;
  installation_date: string | null;
  image_blob_path: string | null;
  notes: string | null;
  /** Current process links (the form edits a single-select over them). */
  process_ids: number[];
}

/**
 * Right-hand expansion of the equipment modal: search the catalog and preview
 * the candidate parent as a read-only, filled presentation card before
 * assigning it. Used by `MachineModal` (`use-machine-form.ts` owns the
 * selection state); has no dependency on any particular dialog chrome.
 */
export function ParentSearchPanel({
  choices,
  selectedId,
  onSelect,
  disabled,
}: {
  choices: ParentOption[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  disabled: boolean;
}) {
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
    <div className="flex w-72 shrink-0 flex-col gap-3 border-l pl-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Buscar equipo padre
      </p>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Matrícula, nombre, marca…"
        disabled={disabled}
      />
      <div className="max-h-40 overflow-auto rounded-md border">
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

      {preview ? (
        <div className="flex flex-col gap-2 rounded-lg border bg-gray-50/60 p-3">
          {preview.has_image ? (
            // eslint-disable-next-line @next/next/no-img-element -- SAS-redirect URL, not optimizable
            <img
              src={`/api/maintenance/assets/${preview.asset_id}/image`}
              alt={`Imagen de ${preview.name}`}
              className="h-28 w-full rounded-md border object-cover"
            />
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <span className="rounded border bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
              {preview.code}
            </span>
            <Badge variant="outline">{preview.type_name || "Sin tipo"}</Badge>
          </div>
          <p className="font-semibold leading-tight text-ezi-gray">
            {preview.name}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <ReadOnlyField label="Marca" value={preview.brand} />
            <ReadOnlyField label="Modelo" value={preview.model} />
            <ReadOnlyField label="Serie" value={preview.serial_number} />
            <ReadOnlyField label="Planta" value={preview.plant_name} />
          </dl>
          {selectedId === preview.asset_id ? (
            <p className="text-center text-xs font-medium text-green-700">
              Asignado como padre
            </p>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={disabled}
              onClick={() => onSelect(preview.asset_id)}
            >
              Asignar como padre
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Selecciona un equipo para ver su tarjeta.
        </p>
      )}
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate">
        {value ? value : <span className="text-muted-foreground">—</span>}
      </dd>
    </>
  );
}
