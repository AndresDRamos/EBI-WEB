"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Tags } from "lucide-react";
import {
  GroupedDataTable,
  type GroupedChildColumn,
} from "@/components/kit/grouped-data-table";
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
import { useEntityCrud } from "@/components/kit/use-entity-crud";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useCan } from "@/components/providers/permissions-provider";

export interface CategoryGroupRow {
  asset_category_id: number;
  code: string;
  name: string;
  is_active: boolean;
}

export interface TypeChildRow {
  asset_type_id: number;
  asset_category_id: number;
  code: string;
  name: string;
  code_prefix: string;
  /** Process links (N:M in DB; the UI edits a single select for now). */
  process_ids: number[];
  process_names: string[];
  is_active: boolean;
}

export interface ProcessOption {
  process_id: number;
  code: string;
  name: string;
}

/**
 * Catálogos — asset categories grouped with their types (mirror of the
 * Departamento→Rol grouped table in the admin panel). Since V18 the TYPE
 * carries the matrícula `code_prefix` and the process it performs (stored
 * N:M, edited as 1:1 for now); the category is just the grouping. CRUD gated
 * per permission (`maintenance.asset_category:*` / `maintenance.asset_type:*`).
 */
export function MachineCatalogsPage({
  categories,
  types,
  processes,
}: {
  categories: CategoryGroupRow[];
  types: TypeChildRow[];
  processes: ProcessOption[];
}) {
  const can = useCan();
  const router = useRouter();

  // --- Category CRUD ---------------------------------------------------------
  const catCrud = useEntityCrud<CategoryGroupRow>({
    basePath: "/api/maintenance/asset-categories",
    getId: (r) => r.asset_category_id,
  });
  const { modalState: catModal } = catCrud;
  const [catCode, setCatCode] = React.useState("");
  const [catName, setCatName] = React.useState("");

  // --- Type CRUD ---------------------------------------------------------------
  // `extra` carries the parent category id when creating a type from a group row.
  const typeCrud = useEntityCrud<TypeChildRow, number>({
    basePath: "/api/maintenance/asset-types",
    getId: (r) => r.asset_type_id,
  });
  const { modalState: typeModal } = typeCrud;
  const [typeCode, setTypeCode] = React.useState("");
  const [typeName, setTypeName] = React.useState("");
  const [typeCategoryId, setTypeCategoryId] = React.useState<string>("");
  const [typeProcessId, setTypeProcessId] = React.useState<string>("");

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

  function resetCatForm() {
    setCatCode("");
    setCatName("");
  }

  function openCreateCat() {
    resetCatForm();
    catCrud.openCreate();
  }

  function openEditCat(g: CategoryGroupRow) {
    setCatCode(g.code);
    setCatName(g.name);
    catCrud.openEdit(g);
  }

  async function onSubmitCat() {
    if (!catCode.trim() || !catName.trim()) {
      catCrud.setError("Código y nombre son obligatorios.");
      return;
    }
    const ok = await catCrud.submit(
      {
        code: catCode.trim(),
        name: catName.trim(),
      },
      "No se pudo guardar la categoría.",
    );
    if (ok) resetCatForm();
  }

  // --- Type handlers ---------------------------------------------------------

  function resetTypeForm() {
    setTypeCode("");
    setTypeName("");
    setTypeCategoryId("");
    setTypeProcessId("");
  }

  function openCreateType(g: CategoryGroupRow) {
    resetTypeForm();
    setTypeCategoryId(String(g.asset_category_id));
    typeCrud.openCreate(g.asset_category_id);
  }

  function openEditType(t: TypeChildRow) {
    setTypeCode(t.code);
    setTypeName(t.name);
    setTypeCategoryId(String(t.asset_category_id));
    setTypeProcessId(t.process_ids[0] ? String(t.process_ids[0]) : "");
    typeCrud.openEdit(t, t.asset_category_id);
  }

  async function onSubmitType() {
    if (!typeCode.trim() || !typeName.trim() || !typeCategoryId) {
      typeCrud.setError("Categoría, código y nombre son obligatorios.");
      return;
    }
    if (!/^[A-Za-z0-9]{2,8}$/.test(typeCode.trim())) {
      typeCrud.setError(
        "El código debe ser alfanumérico (2–8 caracteres): también se usa como prefijo de la matrícula.",
      );
      return;
    }
    const ok = await typeCrud.submit(
      {
        asset_category_id: Number(typeCategoryId),
        code: typeCode.trim().toUpperCase(),
        name: typeName.trim(),
        process_ids: typeProcessId ? [Number(typeProcessId)] : [],
      },
      "No se pudo guardar el tipo.",
    );
    if (ok) resetTypeForm();
  }

  const childColumns: GroupedChildColumn<TypeChildRow>[] = React.useMemo(
    () => [
      {
        key: "name",
        header: "Tipo de equipo",
        render: (t) => <span className="font-medium">{t.name}</span>,
        className: "w-[34%]",
      },
      {
        key: "prefix",
        header: "Prefijo",
        render: (t) => (
          <span className="rounded border bg-white px-1.5 font-mono text-[11px] text-muted-foreground">
            {t.code_prefix}
          </span>
        ),
        className: "w-[13%]",
      },
      {
        key: "process",
        header: "Proceso",
        render: (t) =>
          t.process_names.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {t.process_names.map((n) => (
                <Badge key={n} variant="outline">
                  {n}
                </Badge>
              ))}
            </span>
          ) : (
            <span className="text-muted-foreground">Sin proceso</span>
          ),
        className: "w-[30%]",
      },
      {
        key: "code",
        header: "Código",
        render: (t) => (
          <span className="font-mono text-xs text-muted-foreground">{t.code}</span>
        ),
        className: "w-[17%]",
      },
    ],
    [],
  );

  const activeCategories = categories.filter((c) => c.is_active);

  return (
    <>
      <GroupedDataTable<CategoryGroupRow, TypeChildRow>
        icon={Tags}
        title="Categorías y tipos de equipo"
        subtitle="Cada categoría agrupa sus tipos de equipo. El tipo define el prefijo de la matrícula automática y el proceso que realiza."
        groups={groups}
        getGroupId={(g) => g.asset_category_id}
        renderGroupTitle={(g) => (
          <span className="flex items-baseline gap-2">
            <span className="font-semibold">{g.name}</span>
            <span className="font-mono text-xs text-muted-foreground">{g.code}</span>
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
            ? (g) => catCrud.onSoftDelete(g, "No se pudo desactivar la categoría.")
            : undefined
        }
        onHardDeleteGroup={
          can("maintenance.asset_category:delete")
            ? (g) =>
                catCrud.onHardDelete(
                  g,
                  "No se pudo eliminar la categoría (¿tiene tipos asociados?).",
                )
            : undefined
        }
        onRestoreGroup={
          can("maintenance.asset_category:update")
            ? (g) => catCrud.onRestore(g, "No se pudo reactivar la categoría.")
            : undefined
        }
        onEditChild={
          can("maintenance.asset_type:update") ? openEditType : undefined
        }
        onSoftDeleteChild={
          can("maintenance.asset_type:update")
            ? (t) => typeCrud.onSoftDelete(t, "No se pudo desactivar el tipo.")
            : undefined
        }
        onHardDeleteChild={
          can("maintenance.asset_type:delete")
            ? (t) =>
                typeCrud.onHardDelete(
                  t,
                  "No se pudo eliminar el tipo (¿hay equipos con este tipo?).",
                )
            : undefined
        }
        onRestoreChild={
          can("maintenance.asset_type:update")
            ? (t) => typeCrud.onRestore(t, "No se pudo reactivar el tipo.")
            : undefined
        }
        onAfterChange={() => router.refresh()}
      />

      <EntityFormDialog
        open={catModal.open}
        onOpenChange={(open) => {
          if (!open) catCrud.closeModal();
        }}
        title={catModal.editId === null ? "Nueva categoría" : "Editar categoría"}
        busy={catCrud.busy}
        error={catCrud.error}
        onSubmit={onSubmitCat}
        onCancel={() => catCrud.closeModal()}
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
              disabled={catCrud.busy}
              placeholder="p. ej. Equipo de producción"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-code">Código *</Label>
            <Input
              id="cat-code"
              value={catCode}
              onChange={(e) => setCatCode(e.target.value)}
              maxLength={40}
              disabled={catCrud.busy}
              placeholder="p. ej. production_equipment"
            />
            <p className="text-xs text-muted-foreground">
              Clave estable interna (minúsculas, sin espacios).
            </p>
          </div>
        </div>
      </EntityFormDialog>

      <EntityFormDialog
        open={typeModal.open}
        onOpenChange={(open) => {
          if (!open) typeCrud.closeModal();
        }}
        title={typeModal.editId === null ? "Nuevo tipo de equipo" : "Editar tipo de equipo"}
        description="El código del tipo también sirve como prefijo de la matrícula automática de sus equipos (p. ej. CL-P1-0001). El proceso aplica a todos los equipos del tipo."
        busy={typeCrud.busy}
        error={typeCrud.error}
        onSubmit={onSubmitType}
        onCancel={() => typeCrud.closeModal()}
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
              disabled={typeCrud.busy}
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
                disabled={typeCrud.busy}
                placeholder="p. ej. Cortadora láser"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type-code">Código *</Label>
              <Input
                id="type-code"
                value={typeCode}
                onChange={(e) => setTypeCode(e.target.value.toUpperCase())}
                maxLength={8}
                disabled={typeCrud.busy}
                placeholder="p. ej. CL"
                className="font-mono uppercase"
              />
              <p className="text-xs text-muted-foreground">
                2–8 caracteres alfanuméricos. Único entre todos los tipos: también es
                el prefijo de la matrícula.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="type-process">Proceso</Label>
            <Select
              id="type-process"
              value={typeProcessId}
              onChange={(e) => setTypeProcessId(e.target.value)}
              disabled={typeCrud.busy}
            >
              <option value="">Sin proceso</option>
              {processes.map((p) => (
                <option key={p.process_id} value={p.process_id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              Proceso que realiza este tipo de máquina.
            </p>
          </div>
        </div>
      </EntityFormDialog>
    </>
  );
}
