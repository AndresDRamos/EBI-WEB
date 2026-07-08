"use client";

import * as React from "react";
import type {
  MachineFormAsset,
  ParentOption,
  TypeOption,
} from "@/modules/maintenance/components/machine-form-dialog";

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
 * locally after each successful save (no refetch needed).
 */
export function useMachineForm({ asset, types, parents, onSaved }: UseMachineFormParams) {
  const [saved, setSaved] = React.useState<MachineFormAsset | null>(asset);
  const [name, setName] = React.useState(saved?.name ?? "");
  const [brand, setBrand] = React.useState(saved?.brand ?? "");
  const [model, setModel] = React.useState(saved?.model ?? "");
  const [serial, setSerial] = React.useState(saved?.serial_number ?? "");
  const [plantId, setPlantId] = React.useState<string>(
    saved ? String(saved.plant_id) : "",
  );
  const [status, setStatus] = React.useState(saved?.status ?? "active");
  const [typeId, setTypeId] = React.useState<string>(
    saved?.asset_type_id ? String(saved.asset_type_id) : "",
  );
  const [processId, setProcessId] = React.useState<string>(
    saved?.process_ids?.[0] ? String(saved.process_ids[0]) : "",
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
    const byCat = new Map<number, { category: string; items: TypeOption[] }>();
    for (const t of types) {
      const g = byCat.get(t.asset_category_id) ?? {
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
    setPlantId(s ? String(s.plant_id) : "");
    setStatus(s?.status ?? "active");
    setTypeId(s?.asset_type_id ? String(s.asset_type_id) : "");
    setProcessId(s?.process_ids?.[0] ? String(s.process_ids[0]) : "");
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
    if (!name.trim() || !plantId) {
      setError("Nombre y planta son obligatorios.");
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
        plant_id: Number(plantId),
        asset_type_id: Number(typeId),
        brand: brand.trim() || null,
        model: model.trim() || null,
        serial_number: serial.trim() || null,
        status,
        parent_asset_id: parentId,
        installation_date: installationDate,
        image_blob_path: imagePath,
        notes: notes.trim() || null,
      };
      const processIds = processId ? [Number(processId)] : [];

      if (saved) {
        const res = await fetch(`/api/maintenance/assets/${saved.asset_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, process_ids: processIds }),
        });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(d.error ?? "No se pudo guardar el equipo.");
        }
        const merged: MachineFormAsset = {
          ...saved,
          ...payload,
          process_ids: processIds,
        };
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
        if (processIds.length > 0) {
          const pres = await fetch(`/api/maintenance/assets/${assetId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ process_ids: processIds }),
          });
          if (!pres.ok) {
            throw new Error(
              "El equipo se creó pero no se pudo asignar el proceso; edítalo para reintentar.",
            );
          }
        }
        const created: MachineFormAsset = {
          asset_id: assetId,
          code: d.asset.code,
          ...payload,
          process_ids: processIds,
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
      plantId, setPlantId,
      status, setStatus,
      typeId, setTypeId,
      processId, setProcessId,
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
