"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
import { IconPickerField } from "@/modules/org/components/section-edit-dialog";
import { apiMutate } from "@/lib/api-client";
import type { ItemRow, SectionRow } from "@/modules/org/components/permission-manager";

export function ItemEditDialog({
  sectionId,
  section,
  parentItemId,
  topLevelItems,
  item,
  onOpenChange,
  onSaved,
}: {
  sectionId: number;
  section: SectionRow | null;
  parentItemId: number | null;
  topLevelItems: ItemRow[];
  item: ItemRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = React.useState(item?.label ?? "");
  const [icon, setIcon] = React.useState(item?.icon ?? "");
  const [href, setHref] = React.useState(item?.href ?? (section ? `${section.base_path}/` : ""));
  const [isActive, setIsActive] = React.useState(item?.is_active ?? true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isChildCreate = item === null && parentItemId !== null;

  async function onSubmit() {
    if (!label.trim() || !href.trim()) {
      setError("Etiqueta y ruta son obligatorias.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const url = item ? `/api/nav/items/${item.item_id}` : "/api/nav/items";
      const method = item ? "PUT" : "POST";
      const body: Record<string, unknown> = {
        label: label.trim(),
        icon: icon || null,
        href: href.trim(),
      };
      if (!item) {
        body.section_id = sectionId;
        body.parent_item_id = parentItemId;
        body.sort_order = (topLevelItems.length + 1) * 10;
      } else {
        body.is_active = isActive;
      }
      await apiMutate(url, { method, body, fallback: "No se pudo guardar la página." });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <EntityFormDialog
      open
      onOpenChange={onOpenChange}
      title={item ? "Editar página" : isChildCreate ? "Nueva sub-página" : "Nueva página"}
      busy={busy}
      error={error}
      onSubmit={onSubmit}
      onCancel={() => onOpenChange(false)}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="tree-item-label">Etiqueta *</Label>
          <Input id="tree-item-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} disabled={busy} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tree-item-href">Ruta *</Label>
          <Input
            id="tree-item-href"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            maxLength={200}
            disabled={busy}
            placeholder={section ? `${section.base_path}/...` : undefined}
          />
        </div>
        <IconPickerField id="tree-item-icon" value={icon} onChange={setIcon} disabled={busy} />
        {item ? (
          <div className="flex items-center gap-2">
            <Checkbox id="tree-item-active" checked={isActive} onCheckedChange={(c) => setIsActive(Boolean(c))} disabled={busy} />
            <Label htmlFor="tree-item-active">Activo</Label>
          </div>
        ) : null}
      </div>
    </EntityFormDialog>
  );
}
