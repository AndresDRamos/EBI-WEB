"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/admin/data-table";
import { EntityFormDialog } from "@/components/admin/entity-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { NavIcon, NAV_ICON_NAMES } from "@/lib/nav/icons";

export interface NavSectionRow {
  section_id: number;
  code: string;
  label: string;
  icon: string | null;
  base_path: string;
  sort_order: number;
  is_active: boolean;
}

/**
 * Sections list for the "Accesos a módulos" admin screen. `code` and
 * `base_path` are read-only: sections are seeded by the migration of the
 * module that introduces them (routes are owned by code), the admin only
 * edits label / icon / order / active and — separately — role grants
 * (`NavGrantsPanel`) and items (`NavItemsPanel`).
 */
export function NavSectionsTablePage({ sections }: { sections: NavSectionRow[] }) {
  const router = useRouter();
  const [modalState, setModalState] = React.useState<{ open: boolean; editId: number | null }>({
    open: false,
    editId: null,
  });
  const [label, setLabel] = React.useState("");
  const [icon, setIcon] = React.useState("");
  const [sortOrder, setSortOrder] = React.useState("0");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  function resetForm() {
    setLabel("");
    setIcon("");
    setSortOrder("0");
    setError(null);
  }

  function openEdit(row: NavSectionRow) {
    setLabel(row.label);
    setIcon(row.icon ?? "");
    setSortOrder(String(row.sort_order));
    setError(null);
    setModalState({ open: true, editId: row.section_id });
  }

  async function onSubmit() {
    if (modalState.editId === null) return;
    setError(null);
    if (!label.trim()) {
      setError("La etiqueta es obligatoria.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/nav/sections/${modalState.editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          icon: icon || null,
          sort_order: Number(sortOrder) || 0,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo guardar la sección.");
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

  async function onSoftDelete(row: NavSectionRow): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/nav/sections/${row.section_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: d.error ?? "No se pudo desactivar la sección." };
    }
    router.refresh();
    return { ok: true };
  }

  async function onHardDelete(row: NavSectionRow): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/nav/sections/${row.section_id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: d.error ?? "No se pudo eliminar la sección." };
    }
    router.refresh();
    return { ok: true };
  }

  const columns: ColumnDef<NavSectionRow>[] = React.useMemo(
    () => [
      {
        key: "label",
        header: "Etiqueta",
        accessor: (r) => r.label,
        filter: { kind: "text" },
        render: (r) => (
          <span className="flex items-center gap-2 font-medium">
            <NavIcon name={r.icon} className="h-4 w-4 text-ezi-orange" />
            {r.label}
          </span>
        ),
      },
      {
        key: "base_path",
        header: "Ruta base",
        accessor: (r) => r.base_path,
        render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.base_path}</span>,
      },
      {
        key: "sort_order",
        header: "Orden",
        accessor: (r) => r.sort_order,
      },
    ],
    [],
  );

  return (
    <>
      <DataTable
        icon={Lock}
        title="Secciones del topbar"
        subtitle="Sembradas por la migración de cada módulo; edite etiqueta, ícono, orden y visibilidad. Las rutas son propiedad del código."
        rows={sections}
        getRowId={(r) => r.section_id}
        columns={columns}
        isActive={(r) => r.is_active}
        onEdit={openEdit}
        onSoftDelete={onSoftDelete}
        onHardDelete={onHardDelete}
        onAfterChange={() => router.refresh()}
      />
      <EntityFormDialog
        open={modalState.open}
        onOpenChange={(open) => {
          setModalState((prev) => ({ open, editId: open ? prev.editId : null }));
          if (!open) resetForm();
        }}
        title="Editar sección"
        description="La ruta base no es editable: la define el código del módulo."
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
            <Label htmlFor="section-label">Etiqueta *</Label>
            <Input
              id="section-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="section-icon">Ícono</Label>
            <Select
              id="section-icon"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              disabled={busy}
            >
              <option value="">Sin ícono</option>
              {NAV_ICON_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="section-order">Orden</Label>
            <Input
              id="section-order"
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
