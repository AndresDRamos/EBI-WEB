"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
import { NavIcon, NAV_ICON_NAMES } from "@/components/kit/nav-icon";
import { apiMutate } from "@/lib/api-client";
import type { SectionRow } from "@/modules/org/components/permission-manager";

// ---------------------------------------------------------------------------
// Structure CRUD dialogs (inline replacement for the retired Módulos tab)
// ---------------------------------------------------------------------------

/** Icon dropdown + live preview — shared by `SectionEditDialog` and `ItemEditDialog`. */
export function IconPickerField({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Ícono</Label>
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-gray-50 text-ezi-orange">
          <NavIcon name={value || null} className="h-5 w-5" />
        </span>
        <Select
          id={id}
          className="flex-1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          <option value="">Sin ícono</option>
          {NAV_ICON_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

export function SectionEditDialog({
  section,
  onOpenChange,
  onSaved,
}: {
  section: SectionRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = React.useState(section?.label ?? "");
  const [icon, setIcon] = React.useState(section?.icon ?? "");
  const [sortOrder, setSortOrder] = React.useState(String(section?.sort_order ?? 0));
  const [isActive, setIsActive] = React.useState(section?.is_active ?? true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit() {
    if (!section) return;
    if (!label.trim()) {
      setError("La etiqueta es obligatoria.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiMutate(`/api/navigation/nav/sections/${section.section_id}`, {
        method: "PUT",
        body: {
          label: label.trim(),
          icon: icon || null,
          sort_order: Number(sortOrder) || 0,
          is_active: isActive,
        },
        fallback: "No se pudo guardar la sección.",
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <EntityFormDialog
      open={section !== null}
      onOpenChange={onOpenChange}
      title="Editar sección"
      description="La ruta base no es editable: la define el código del módulo."
      busy={busy}
      error={error}
      onSubmit={onSubmit}
      onCancel={() => onOpenChange(false)}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="tree-section-label">Etiqueta *</Label>
          <Input id="tree-section-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} disabled={busy} />
        </div>
        <IconPickerField id="tree-section-icon" value={icon} onChange={setIcon} disabled={busy} />
        <div className="space-y-2">
          <Label htmlFor="tree-section-order">Orden global (empate de prioridad)</Label>
          <Input
            id="tree-section-order"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="tree-section-active" checked={isActive} onCheckedChange={(c) => setIsActive(Boolean(c))} disabled={busy} />
          <Label htmlFor="tree-section-active">Activa</Label>
        </div>
      </div>
    </EntityFormDialog>
  );
}
