"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Tags } from "lucide-react";
import {
  GroupedDataTable,
  type GroupedChildColumn,
} from "@/components/kit/grouped-data-table";
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useCan } from "@/components/providers/permissions-provider";

export interface CategoryGroupRow {
  asset_category_id: number;
  code: string;
  name: string;
  code_prefix: string;
  is_active: boolean;
}

export interface TypeChildRow {
  asset_type_id: number;
  asset_category_id: number;
  code: string;
  name: string;
  is_active: boolean;
}

/**
 * Catálogos — asset categories grouped with their types (mirror of the
 * Departamento→Rol grouped table in the admin panel). A category carries the
 * matrícula `code_prefix`; a type only exists inside a category and is what
 * the machine form actually assigns. CRUD gated per permission
 * (`maintenance.asset_category:*` / `maintenance.asset_type:*`).
 */
export function MachineCatalogsPage({
  categories,
  types,
}: {
  categories: CategoryGroupRow[];
  types: TypeChildRow[];
}) {
  const can = useCan();
  const router = useRouter();

  // --- Category modal state -----------------------------------------------
  const [catModal, setCatModal] = React.useState<{
    open: boolean;
    editId: number | null;
  }>({ open: false, editId: null });
  const [catCode, setCatCode] = React.useState("");
  const [catName, setCatName] = React.useState("");
  const [catPrefix, setCatPrefix] = React.useState("");
  const [catError, setCatError] = React.useState<string | null>(null);
  const [catBusy, setCatBusy] = React.useState(false);

  // --- Type modal state -----------------------------------------------------
  const [typeModal, setTypeModal] = React.useState<{
    open: boolean;
    editId: number | null;
  }>({ open: false, editId: null });
  const [typeCode, setTypeCode] = React.useState("");
  const [typeName, setTypeName] = React.useState("");
  const [typeCategoryId, setTypeCategoryId] = React.useState<string>("");
  const [typeError, setTypeError] = React.useState<string | null>(null);
  const [typeBusy, setTypeBusy] = React.useState(false);

  const groups = React.useMemo(
    () =>
      [...categories].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [categories],
  );

  const childrenOf = React.useCallback(
    (g: CategoryGroupRow) =>
      types.filter((t) => t.asset_category_id === g.asset_category_id),
    [types],
  );

  // --- Category handlers ----------------------------------------------------

  function openCreateCat() {
    setCatCode("");
    setCatName("");
    setCatPrefix("");
    setCatError(null);
    setCatModal({ open: true, editId: null });
  }

  function openEditCat(g: CategoryGroupRow) {
    setCatCode(g.code);
    setCatName(g.name);
    setCatPrefix(g.code_prefix);
    setCatError(null);
    setCatModal({ open: true, editId: g.asset_category_id });
  }

  async function onSubmitCat() {
    setCatError(null);
    if (!catCode.trim() || !catName.trim() || !catPrefix.trim()) {
      setCatError("Código, nombre y prefijo son obligatorios.");
      return;
    }
    if (!/^[A-Za-z0-9]{2,8}$/.test(catPrefix.trim())) {
      setCatError("El prefijo debe ser alfanumérico (2–8 caracteres).");
      return;
    }
    setCatBusy(true);
    try {
      const id = catModal.editId;
      const res = await fetch(
        id
          ? `/api/maintenance/asset-categories/${id}`
          : "/api/maintenance/asset-categories",
        {
          method: id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: catCode.trim(),
            name: catName.trim(),
            code_prefix: catPrefix.trim().toUpperCase(),
          }),
        },
      );
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo guardar la categoría.");
      }
      setCatModal({ open: false, editId: null });
      router.refresh();
    } catch (err) {
      setCatError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCatBusy(false);
    }
  }

  async function catAction(
    g: CategoryGroupRow,
    init: RequestInit,
    fallback: string,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(
      `/api/maintenance/asset-categories/${g.asset_category_id}`,
      init,
    );
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: d.error ?? fallback };
    }
    router.refresh();
    return { ok: true };
  }

  // --- Type handlers ---------------------------------------------------------

  function openCreateType(g: CategoryGroupRow) {
    setTypeCode("");
    setTypeName("");
    setTypeCategoryId(String(g.asset_category_id));
    setTypeError(null);
    setTypeModal({ open: true, editId: null });
  }

  function openEditType(t: TypeChildRow) {
    setTypeCode(t.code);
    setTypeName(t.name);
    setTypeCategoryId(String(t.asset_category_id));
    setTypeError(null);
    setTypeModal({ open: true, editId: t.asset_type_id });
  }

  async function onSubmitType() {
    setTypeError(null);
    if (!typeCode.trim() || !typeName.trim() || !typeCategoryId) {
      setTypeError("Categoría, código y nombre son obligatorios.");
      return;
    }
    setTypeBusy(true);
    try {
      const id = typeModal.editId;
      const res = await fetch(
        id ? `/api/maintenance/asset-types/${id}` : "/api/maintenance/asset-types",
        {
          method: id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asset_category_id: Number(typeCategoryId),
            code: typeCode.trim(),
            name: typeName.trim(),
          }),
        },
      );
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo guardar el tipo.");
      }
      setTypeModal({ open: false, editId: null });
      router.refresh();
    } catch (err) {
      setTypeError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setTypeBusy(false);
    }
  }

  async function typeAction(
    t: TypeChildRow,
    init: RequestInit,
    fallback: string,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/maintenance/asset-types/${t.asset_type_id}`, init);
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: d.error ?? fallback };
    }
    router.refresh();
    return { ok: true };
  }

  const childColumns: GroupedChildColumn<TypeChildRow>[] = React.useMemo(
    () => [
      {
        key: "name",
        header: "Tipo de equipo",
        render: (t) => <span className="font-medium">{t.name}</span>,
        className: "w-72",
      },
      {
        key: "code",
        header: "Código",
        render: (t) => (
          <span className="font-mono text-xs text-muted-foreground">{t.code}</span>
        ),
      },
    ],
    [],
  );

  const activeCategories = categories.filter((c) => c.is_active);

  const jsonPut = (body: unknown): RequestInit => ({
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return (
    <>
      <GroupedDataTable<CategoryGroupRow, TypeChildRow>
        icon={Tags}
        title="Catálogos de equipo"
        subtitle="Cada categoría agrupa sus tipos de equipo y define el prefijo de la matrícula automática."
        groups={groups}
        getGroupId={(g) => g.asset_category_id}
        renderGroupTitle={(g) => (
          <span className="flex items-baseline gap-2">
            <span className="font-semibold">{g.name}</span>
            <span className="rounded border bg-white px-1.5 font-mono text-[11px] text-muted-foreground">
              {g.code_prefix}
            </span>
          </span>
        )}
        groupIsActive={(g) => g.is_active}
        childrenOf={childrenOf}
        getChildId={(t) => t.asset_type_id}
        childIsActive={(t) => t.is_active}
        childColumns={childColumns}
        childNoun="tipo"
        onAddGroup={
          can("maintenance.asset_category:create") ? openCreateCat : undefined
        }
        addGroupLabel="Nueva categoría"
        onAddChild={
          can("maintenance.asset_type:create") ? openCreateType : undefined
        }
        addChildLabel="Agregar tipo"
        onEditGroup={
          can("maintenance.asset_category:update") ? openEditCat : undefined
        }
        onSoftDeleteGroup={
          can("maintenance.asset_category:update")
            ? (g) =>
                catAction(
                  g,
                  jsonPut({ is_active: false }),
                  "No se pudo desactivar la categoría.",
                )
            : undefined
        }
        onHardDeleteGroup={
          can("maintenance.asset_category:delete")
            ? (g) =>
                catAction(
                  g,
                  { method: "DELETE" },
                  "No se pudo eliminar la categoría (¿tiene tipos asociados?).",
                )
            : undefined
        }
        onRestoreGroup={
          can("maintenance.asset_category:update")
            ? (g) =>
                catAction(
                  g,
                  jsonPut({ is_active: true }),
                  "No se pudo reactivar la categoría.",
                )
            : undefined
        }
        onEditChild={
          can("maintenance.asset_type:update") ? openEditType : undefined
        }
        onSoftDeleteChild={
          can("maintenance.asset_type:update")
            ? (t) =>
                typeAction(
                  t,
                  jsonPut({ is_active: false }),
                  "No se pudo desactivar el tipo.",
                )
            : undefined
        }
        onHardDeleteChild={
          can("maintenance.asset_type:delete")
            ? (t) =>
                typeAction(
                  t,
                  { method: "DELETE" },
                  "No se pudo eliminar el tipo (¿hay equipos con este tipo?).",
                )
            : undefined
        }
        onRestoreChild={
          can("maintenance.asset_type:update")
            ? (t) =>
                typeAction(
                  t,
                  jsonPut({ is_active: true }),
                  "No se pudo reactivar el tipo.",
                )
            : undefined
        }
        onAfterChange={() => router.refresh()}
      />

      <EntityFormDialog
        open={catModal.open}
        onOpenChange={(open) => {
          setCatModal((prev) => ({ open, editId: open ? prev.editId : null }));
          if (!open) setCatError(null);
        }}
        title={catModal.editId === null ? "Nueva categoría" : "Editar categoría"}
        description="El prefijo forma la matrícula de los equipos de esta categoría (p. ej. PRD-P1-0001)."
        busy={catBusy}
        error={catError}
        onSubmit={onSubmitCat}
        onCancel={() => setCatModal({ open: false, editId: null })}
        submitLabel={catModal.editId === null ? "Crear categoría" : "Guardar cambios"}
        sizeClassName="sm:max-w-lg"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cat-name">Nombre *</Label>
            <Input
              id="cat-name"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              maxLength={120}
              disabled={catBusy}
              placeholder="p. ej. Equipo de producción"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cat-code">Código *</Label>
              <Input
                id="cat-code"
                value={catCode}
                onChange={(e) => setCatCode(e.target.value)}
                maxLength={40}
                disabled={catBusy}
                placeholder="p. ej. production_equipment"
              />
              <p className="text-xs text-muted-foreground">
                Clave estable interna (minúsculas, sin espacios).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-prefix">Prefijo de matrícula *</Label>
              <Input
                id="cat-prefix"
                value={catPrefix}
                onChange={(e) => setCatPrefix(e.target.value.toUpperCase())}
                maxLength={8}
                disabled={catBusy}
                placeholder="p. ej. PRD"
                className="font-mono uppercase"
              />
            </div>
          </div>
        </div>
      </EntityFormDialog>

      <EntityFormDialog
        open={typeModal.open}
        onOpenChange={(open) => {
          setTypeModal((prev) => ({ open, editId: open ? prev.editId : null }));
          if (!open) setTypeError(null);
        }}
        title={typeModal.editId === null ? "Nuevo tipo de equipo" : "Editar tipo de equipo"}
        busy={typeBusy}
        error={typeError}
        onSubmit={onSubmitType}
        onCancel={() => setTypeModal({ open: false, editId: null })}
        submitLabel={typeModal.editId === null ? "Crear tipo" : "Guardar cambios"}
        sizeClassName="sm:max-w-lg"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="type-category">Categoría *</Label>
            <Select
              id="type-category"
              value={typeCategoryId}
              onChange={(e) => setTypeCategoryId(e.target.value)}
              disabled={typeBusy}
            >
              <option value="">Selecciona…</option>
              {activeCategories.map((c) => (
                <option key={c.asset_category_id} value={c.asset_category_id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="type-name">Nombre *</Label>
              <Input
                id="type-name"
                value={typeName}
                onChange={(e) => setTypeName(e.target.value)}
                maxLength={120}
                disabled={typeBusy}
                placeholder="p. ej. Corte láser"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type-code">Código *</Label>
              <Input
                id="type-code"
                value={typeCode}
                onChange={(e) => setTypeCode(e.target.value)}
                maxLength={40}
                disabled={typeBusy}
                placeholder="p. ej. laser_cutting"
              />
              <p className="text-xs text-muted-foreground">
                Único dentro de la categoría.
              </p>
            </div>
          </div>
        </div>
      </EntityFormDialog>
    </>
  );
}
