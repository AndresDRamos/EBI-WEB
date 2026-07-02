"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ListTree } from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/admin/data-table";
import { EntityFormDialog } from "@/components/admin/entity-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { NavIcon, NAV_ICON_NAMES } from "@/lib/nav/icons";

export interface NavItemRow {
  item_id: number;
  section_id: number;
  parent_item_id: number | null;
  label: string;
  icon: string | null;
  href: string;
  sort_order: number;
  is_active: boolean;
}

export interface NavSectionOption {
  section_id: number;
  label: string;
  base_path: string;
}

/**
 * Sidebar items per section, one level of nesting (`parent_item_id`). Items
 * point to routes owned by code: `href` must live under the section's
 * `base_path` — validated server-side (`POST`/`PUT /api/nav/items`), the
 * field is free text here because the DB can't check the route exists.
 */
export function NavItemsPanel({
  sections,
  items,
}: {
  sections: NavSectionOption[];
  items: NavItemRow[];
}) {
  const router = useRouter();
  const [sectionId, setSectionId] = React.useState<number | null>(sections[0]?.section_id ?? null);
  const [modalState, setModalState] = React.useState<{ open: boolean; editId: number | null }>({
    open: false,
    editId: null,
  });
  const [label, setLabel] = React.useState("");
  const [icon, setIcon] = React.useState("");
  const [href, setHref] = React.useState("");
  const [parentId, setParentId] = React.useState("");
  const [sortOrder, setSortOrder] = React.useState("0");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const section = sections.find((s) => s.section_id === sectionId) ?? null;
  const sectionItems = items.filter((i) => i.section_id === sectionId);
  const topLevelItems = sectionItems.filter((i) => i.parent_item_id === null);

  function resetForm() {
    setLabel("");
    setIcon("");
    setHref(section ? `${section.base_path}/` : "");
    setParentId("");
    setSortOrder("0");
    setError(null);
  }

  function openCreate() {
    resetForm();
    setModalState({ open: true, editId: null });
  }

  function openEdit(row: NavItemRow) {
    setLabel(row.label);
    setIcon(row.icon ?? "");
    setHref(row.href);
    setParentId(row.parent_item_id ? String(row.parent_item_id) : "");
    setSortOrder(String(row.sort_order));
    setError(null);
    setModalState({ open: true, editId: row.item_id });
  }

  async function onSubmit() {
    if (!section) return;
    setError(null);
    if (!label.trim() || !href.trim()) {
      setError("Etiqueta y ruta son obligatorias.");
      return;
    }
    setBusy(true);
    try {
      const id = modalState.editId;
      const url = id ? `/api/nav/items/${id}` : "/api/nav/items";
      const method = id ? "PUT" : "POST";
      const body = JSON.stringify({
        section_id: section.section_id,
        parent_item_id: parentId ? Number(parentId) : null,
        label: label.trim(),
        icon: icon || null,
        href: href.trim(),
        sort_order: Number(sortOrder) || 0,
      });
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo guardar el ítem.");
      }
      resetForm();
      setModalState({ open: false, editId: null });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  async function onSoftDelete(row: NavItemRow): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/nav/items/${row.item_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: d.error ?? "No se pudo desactivar el ítem." };
    }
    router.refresh();
    return { ok: true };
  }

  async function onHardDelete(row: NavItemRow): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/nav/items/${row.item_id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: d.error ?? "No se pudo eliminar el ítem." };
    }
    router.refresh();
    return { ok: true };
  }

  const columns: ColumnDef<NavItemRow>[] = React.useMemo(
    () => [
      {
        key: "label",
        header: "Etiqueta",
        accessor: (r) => r.label,
        filter: { kind: "text" },
        render: (r) => (
          <span className={r.parent_item_id ? "ml-4 flex items-center gap-2" : "flex items-center gap-2 font-medium"}>
            <NavIcon name={r.icon} className="h-4 w-4 text-ezi-orange" />
            {r.label}
          </span>
        ),
      },
      {
        key: "href",
        header: "Ruta",
        accessor: (r) => r.href,
        render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.href}</span>,
      },
      { key: "sort_order", header: "Orden", accessor: (r) => r.sort_order },
    ],
    [],
  );

  return (
    <>
      <div className="mb-3 flex items-center gap-3">
        <Label htmlFor="items-section" className="shrink-0">
          Sección
        </Label>
        <Select
          id="items-section"
          className="max-w-xs"
          value={sectionId ?? ""}
          onChange={(e) => setSectionId(Number(e.target.value))}
        >
          {sections.map((s) => (
            <option key={s.section_id} value={s.section_id}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      <DataTable
        icon={ListTree}
        title="Ítems del sidebar"
        subtitle="Un nivel de anidamiento. La ruta debe empezar con la ruta base de la sección."
        rows={sectionItems}
        getRowId={(r) => r.item_id}
        columns={columns}
        isActive={(r) => r.is_active}
        onAdd={section ? openCreate : undefined}
        onEdit={openEdit}
        onSoftDelete={onSoftDelete}
        onHardDelete={onHardDelete}
        addLabel="Nuevo ítem"
        onAfterChange={() => router.refresh()}
      />
      <EntityFormDialog
        open={modalState.open}
        onOpenChange={(open) => {
          setModalState((prev) => ({ open, editId: open ? prev.editId : null }));
          if (!open) resetForm();
        }}
        title={modalState.editId === null ? "Nuevo ítem" : "Editar ítem"}
        busy={busy}
        error={error}
        onSubmit={onSubmit}
        onCancel={() => {
          setModalState({ open: false, editId: null });
          resetForm();
        }}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="item-label">Etiqueta *</Label>
            <Input
              id="item-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-href">Ruta *</Label>
            <Input
              id="item-href"
              value={href}
              onChange={(e) => setHref(e.target.value)}
              maxLength={200}
              disabled={busy}
              placeholder={section ? `${section.base_path}/...` : undefined}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-parent">Ítem padre (opcional)</Label>
            <Select
              id="item-parent"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              disabled={busy}
            >
              <option value="">Ninguno (nivel superior)</option>
              {topLevelItems
                .filter((i) => i.item_id !== modalState.editId)
                .map((i) => (
                  <option key={i.item_id} value={i.item_id}>
                    {i.label}
                  </option>
                ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-icon">Ícono</Label>
            <Select id="item-icon" value={icon} onChange={(e) => setIcon(e.target.value)} disabled={busy}>
              <option value="">Sin ícono</option>
              {NAV_ICON_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-order">Orden</Label>
            <Input
              id="item-order"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>
      </EntityFormDialog>
    </>
  );
}
