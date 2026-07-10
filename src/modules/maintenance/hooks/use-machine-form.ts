"use client";

import * as React from "react";
import type {
  MachineFormAsset,
  TypeOption,
} from "@/modules/maintenance/components/machine-form-dialog";
import type { ParentOption } from "@/modules/maintenance/types";

export const MONTHS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export interface UseMachineFormParams {
  /** null = creating a new asset. */
  asset: MachineFormAsset | null;
  types: TypeOption[];
  parents: ParentOption[];
  /** Fires after a successful create or edit (the hook's `saved` already
   * reflects the new state by the time this is called). */
  onSaved: (mode: "created" | "updated", assetId: number) => void;
}

/**
 * Form state/submit logic for a maintenance asset, extracted from the former
 * `MachineFormDialogInner` so it can back an always-mounted summary panel
 * (read when not editing, editable in place when editing) instead of a
 * one-shot Radix dialog. Owns a `saved` snapshot internally — the source of
 * truth for read-only display and for what Cancel reverts to — updated
 * locally after each successful save (no refetch needed). Since V18 the form
 * captures the LOCATION (plant derives from it), status is not settable, and
 * processes hang off the asset type (read-only here).
 */
export function useMachineForm({ asset, types, parents, onSaved }: UseMachineFormParams) {
  const [saved, setSaved] = React.useState<MachineFormAsset | null>(asset);
  const [name, setName] = React.useState(saved?.name ?? "");
  const [brand, setBrand] = React.useState(saved?.brand ?? "");
  const [model, setModel] = React.useState(saved?.model ?? "");
  const [serial, setSerial] = React.useState(saved?.serial_number ?? "");
  const [locationId, setLocationId] = React.useState<string>(
    saved ? String(saved.location_id) : "",
  );
  const [typeId, setTypeId] = React.useState<string>(
    saved?.asset_type_id ? String(saved.asset_type_id) : "",
  );
  const [installMonth, setInstallMonth] = React.useState<string>(
    saved?.installation_date ? saved.installation_date.slice(5, 7) : "",
  );
  const [installYear, setInstallYear] = React.useState<string>(
    saved?.installation_date ? saved.installation_date.slice(0, 4) : "",
  );
  const [parentId, setParentId] = React.useState<number | null>(
    saved?.parent_asset_id ?? null,
  );
  const [notes, setNotes] = React.useState(saved?.notes ?? "");
  const [imagePath, setImagePath] = React.useState<string | null>(
    saved?.image_blob_path ?? null,
  );
  const [imagePreview, setImagePreview] = React.useState<string | null>(null);
  const [imageBusy, setImageBusy] = React.useState(false);
  const [parentPanelOpen, setParentPanelOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const selectedType = types.find((t) => String(t.asset_type_id) === typeId);
  const noTypes = types.length === 0;

  const typeGroups = React.useMemo(() => {
    const byCat = new Map<
      number,
      { asset_category_id: number; category: string; items: TypeOption[] }
    >();
    for (const t of types) {
      const g = byCat.get(t.asset_category_id) ?? {
        asset_category_id: t.asset_category_id,
        category: t.category_name,
        items: [],
      };
      g.items.push(t);
      byCat.set(t.asset_category_id, g);
    }
    return [...byCat.values()].sort((a, b) =>
      a.category.localeCompare(b.category, "es"),
    );
  }, [types]);

  const yearNow = new Date().getFullYear();
  const years = React.useMemo(() => {
    const list: number[] = [];
    for (let y = yearNow; y >= yearNow - 60; y--) list.push(y);
    const current = installYear ? Number(installYear) : null;
    if (current && !list.includes(current)) list.push(current);
    return list;
  }, [yearNow, installYear]);

  async function onPickImage(file: File) {
    setError(null);
    setImageBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/maintenance/assets/image", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo subir la imagen.");
      }
      const d = (await res.json()) as { blob_path: string };
      setImagePath(d.blob_path);
      setImagePreview(URL.createObjectURL(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setImageBusy(false);
    }
  }

  function seedFrom(s: MachineFormAsset | null) {
    setName(s?.name ?? "");
    setBrand(s?.brand ?? "");
    setModel(s?.model ?? "");
    setSerial(s?.serial_number ?? "");
    setLocationId(s ? String(s.location_id) : "");
    setTypeId(s?.asset_type_id ? String(s.asset_type_id) : "");
    setInstallMonth(s?.installation_date ? s.installation_date.slice(5, 7) : "");
    setInstallYear(s?.installation_date ? s.installation_date.slice(0, 4) : "");
    setParentId(s?.parent_asset_id ?? null);
    setNotes(s?.notes ?? "");
    setImagePath(s?.image_blob_path ?? null);
    setImagePreview(null);
    setError(null);
  }

  /** Discards in-progress edits, reverting every field to the last saved snapshot. */
  function cancel() {
    seedFrom(saved);
    setParentPanelOpen(false);
  }

  async function submit() {
    setError(null);
    if (!name.trim() || !locationId) {
      setError("Nombre y ubicación son obligatorios.");
      return;
    }
    if (!typeId) {
      setError("Selecciona el tipo de equipo.");
      return;
    }
    if ((installMonth && !installYear) || (!installMonth && installYear)) {
      setError("La fecha de instalación necesita mes y año.");
      return;
    }
    setBusy(true);
    try {
      const installationDate =
        installMonth && installYear ? `${installYear}-${installMonth}-01` : null;
      const payload = {
        name: name.trim(),
        location_id: Number(locationId),
        asset_type_id: Number(typeId),
        brand: brand.trim() || null,
        model: model.trim() || null,
        serial_number: serial.trim() || null,
        parent_asset_id: parentId,
        installation_date: installationDate,
        image_blob_path: imagePath,
        notes: notes.trim() || null,
      };

      if (saved) {
        const res = await fetch(`/api/maintenance/assets/${saved.asset_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(d.error ?? "No se pudo guardar el equipo.");
        }
        const merged: MachineFormAsset = { ...saved, ...payload };
        setSaved(merged);
        setParentPanelOpen(false);
        onSaved("updated", saved.asset_id);
      } else {
        const res = await fetch("/api/maintenance/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(d.error ?? "No se pudo crear el equipo.");
        }
        const d = (await res.json()) as { asset: { asset_id: number; code: string } };
        const assetId = d.asset.asset_id;
        const created: MachineFormAsset = {
          asset_id: assetId,
          code: d.asset.code,
          ...payload,
        };
        setSaved(created);
        setParentPanelOpen(false);
        onSaved("created", assetId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  const parentChoices = React.useMemo(
    () => (saved ? parents.filter((p) => p.asset_id !== saved.asset_id) : parents),
    [parents, saved],
  );
  const selectedParent =
    parentId !== null
      ? (parentChoices.find((p) => p.asset_id === parentId) ?? null)
      : null;

  const imageSrc =
    imagePreview ??
    (saved?.image_blob_path && imagePath === saved.image_blob_path
      ? `/api/maintenance/assets/${saved.asset_id}/image`
      : null);

  return {
    saved,
    fields: {
      name, setName,
      brand, setBrand,
      model, setModel,
      serial, setSerial,
      locationId, setLocationId,
      typeId, setTypeId,
      installMonth, setInstallMonth,
      installYear, setInstallYear,
      parentId, setParentId,
      notes, setNotes,
    },
    selectedType,
    noTypes,
    typeGroups,
    years,
    parentChoices,
    selectedParent,
    parentPanelOpen,
    setParentPanelOpen,
    imageSrc,
    imageBusy,
    onPickImage,
    removeImage: () => {
      setImagePath(null);
      setImagePreview(null);
    },
    busy,
    error,
    submit,
    cancel,
  };
}

export type UseMachineFormResult = ReturnType<typeof useMachineForm>;
