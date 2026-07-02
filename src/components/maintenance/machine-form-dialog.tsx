"use client";

import * as React from "react";
import { EntityFormDialog } from "@/components/admin/entity-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ASSET_CRITICALITIES,
  ASSET_STATUSES,
  statusLabel,
} from "@/lib/maintenance/enums";

export interface PlantOption {
  plant_id: number;
  name: string;
}

export interface ParentOption {
  asset_id: number;
  code: string;
  name: string;
}

/** Subset of asset fields the form edits (create + edit share the dialog). */
export interface MachineFormAsset {
  asset_id: number;
  code: string;
  name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  plant_id: number;
  location: string | null;
  criticality: string;
  status: string;
  parent_asset_id: number | null;
  acquisition_date: string | null;
  notes: string | null;
}

export interface MachineFormDialogProps {
  open: boolean;
  /** null = create; otherwise edit. */
  asset: MachineFormAsset | null;
  plants: PlantOption[];
  parents: ParentOption[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/**
 * Create/edit modal for a maintenance asset. POSTs or PATCHes /api/assets.
 * The inner form is remounted via `key` when the dialog opens for a different
 * row, so `useState` initializers re-seed without effects.
 */
export function MachineFormDialog(props: MachineFormDialogProps) {
  const key = props.open
    ? `open-${props.asset?.asset_id ?? "new"}`
    : "closed";
  return <MachineFormDialogInner key={key} {...props} />;
}

function MachineFormDialogInner({
  open,
  asset,
  plants,
  parents,
  onOpenChange,
  onSaved,
}: MachineFormDialogProps) {
  const [code, setCode] = React.useState(asset?.code ?? "");
  const [name, setName] = React.useState(asset?.name ?? "");
  const [brand, setBrand] = React.useState(asset?.brand ?? "");
  const [model, setModel] = React.useState(asset?.model ?? "");
  const [serial, setSerial] = React.useState(asset?.serial_number ?? "");
  const [plantId, setPlantId] = React.useState<string>(
    asset ? String(asset.plant_id) : "",
  );
  const [location, setLocation] = React.useState(asset?.location ?? "");
  const [criticality, setCriticality] = React.useState(
    asset?.criticality ?? "C",
  );
  const [status, setStatus] = React.useState(asset?.status ?? "active");
  const [parentId, setParentId] = React.useState<string>(
    asset?.parent_asset_id ? String(asset.parent_asset_id) : "",
  );
  const [acquisitionDate, setAcquisitionDate] = React.useState(
    asset?.acquisition_date ? asset.acquisition_date.slice(0, 10) : "",
  );
  const [notes, setNotes] = React.useState(asset?.notes ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit() {
    setError(null);
    if (!code.trim() || !name.trim() || !plantId) {
      setError("Código, nombre y planta son obligatorios.");
      return;
    }
    setBusy(true);
    try {
      const url = asset ? `/api/assets/${asset.asset_id}` : "/api/assets";
      const method = asset ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          plant_id: Number(plantId),
          brand: brand.trim() || null,
          model: model.trim() || null,
          serial_number: serial.trim() || null,
          location: location.trim() || null,
          criticality,
          status,
          parent_asset_id: parentId ? Number(parentId) : null,
          acquisition_date: acquisitionDate || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo guardar el equipo.");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  const parentChoices = asset
    ? parents.filter((p) => p.asset_id !== asset.asset_id)
    : parents;

  return (
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={asset ? "Editar equipo" : "Nuevo equipo"}
      busy={busy}
      error={error}
      onSubmit={onSubmit}
      onCancel={() => onOpenChange(false)}
      submitLabel={asset ? "Guardar cambios" : "Crear equipo"}
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="machine-code">Código *</Label>
            <Input
              id="machine-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={32}
              disabled={busy}
              placeholder="p. ej. PRE-001"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="machine-name">Nombre *</Label>
            <Input
              id="machine-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              disabled={busy}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="machine-brand">Marca</Label>
            <Input
              id="machine-brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              maxLength={120}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="machine-model">Modelo</Label>
            <Input
              id="machine-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              maxLength={120}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="machine-serial">Número de serie</Label>
            <Input
              id="machine-serial"
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              maxLength={120}
              disabled={busy}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="machine-plant">Planta *</Label>
            <Select
              id="machine-plant"
              value={plantId}
              onChange={(e) => setPlantId(e.target.value)}
              disabled={busy}
            >
              <option value="">Selecciona…</option>
              {plants.map((p) => (
                <option key={p.plant_id} value={p.plant_id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="machine-location">Ubicación (área / celda)</Label>
            <Input
              id="machine-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={160}
              disabled={busy}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="machine-criticality">Criticidad</Label>
            <Select
              id="machine-criticality"
              value={criticality}
              onChange={(e) => setCriticality(e.target.value)}
              disabled={busy}
            >
              {ASSET_CRITICALITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="machine-status">Estatus</Label>
            <Select
              id="machine-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={busy}
            >
              {ASSET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="machine-acquired">Fecha de adquisición</Label>
            <Input
              id="machine-acquired"
              type="date"
              value={acquisitionDate}
              onChange={(e) => setAcquisitionDate(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="machine-parent">Equipo padre (subconjunto de)</Label>
          <Select
            id="machine-parent"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            disabled={busy}
          >
            <option value="">Ninguno</option>
            {parentChoices.map((p) => (
              <option key={p.asset_id} value={p.asset_id}>
                {p.code} — {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="machine-notes">Notas</Label>
          <Textarea
            id="machine-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={3}
            disabled={busy}
          />
        </div>
      </div>
    </EntityFormDialog>
  );
}
