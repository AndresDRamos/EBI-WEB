"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Cog } from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
import { useEntityCrud } from "@/components/kit/use-entity-crud";
import { useCan } from "@/components/providers/permissions-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface ProcessesTableRow {
  process_id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface ProcessesTablePageProps {
  processes: ProcessesTableRow[];
}

/** Procesos catalog — company-wide processes (`org.process`). Administered from
 * the admin panel; equipment and plants both link to this catalog. Actions gate
 * per-permission via `useCan` (the API re-checks). */
export function ProcessesTablePage({ processes }: ProcessesTablePageProps) {
  const can = useCan();
  const router = useRouter();
  const crud = useEntityCrud<ProcessesTableRow>({
    basePath: "/api/org/processes",
    getId: (r) => r.process_id,
  });
  const { modalState } = crud;

  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");

  function resetForm() {
    setCode("");
    setName("");
    setDescription("");
  }

  function openCreate() {
    resetForm();
    crud.openCreate();
  }

  function openEdit(row: ProcessesTableRow) {
    setCode(row.code);
    setName(row.name);
    setDescription(row.description ?? "");
    crud.openEdit(row);
  }

  async function onSubmit() {
    if (!code.trim() || !name.trim()) {
      crud.setError("Código y nombre son obligatorios.");
      return;
    }
    const ok = await crud.submit(
      {
        code: code.trim(),
        name: name.trim(),
        description: description.trim() || null,
      },
      "No se pudo guardar el proceso.",
    );
    if (ok) resetForm();
  }

  const onSoftDelete = (row: ProcessesTableRow) =>
    crud.onSoftDelete(row, "No se pudo desactivar el proceso.");
  const onHardDelete = (row: ProcessesTableRow) =>
    crud.onHardDelete(
      row,
      "No se pudo eliminar el proceso (¿tiene equipos o plantas vinculados?).",
    );
  const onRestore = (row: ProcessesTableRow) =>
    crud.onRestore(row, "No se pudo reactivar el proceso.");

  const columns: ColumnDef<ProcessesTableRow>[] = React.useMemo(
    () => [
      {
        key: "code",
        header: "Código",
        accessor: (r) => r.code,
        filter: { kind: "text" },
        render: (r) => <span className="font-mono">{r.code}</span>,
        className: "w-32",
      },
      {
        key: "name",
        header: "Nombre",
        accessor: (r) => r.name,
        filter: { kind: "text" },
        render: (r) => <span className="font-medium">{r.name}</span>,
      },
      {
        key: "description",
        header: "Descripción",
        accessor: (r) => r.description ?? "",
        filter: { kind: "text" },
        render: (r) =>
          r.description ? (
            <span className="whitespace-normal">{r.description}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        className: "min-w-[20rem]",
      },
    ],
    [],
  );

  return (
    <>
      <DataTable
        icon={Cog}
        title="Procesos"
        subtitle="Catálogo de procesos de la empresa. Los equipos y las plantas se vinculan a este catálogo."
        rows={processes}
        getRowId={(r) => r.process_id}
        columns={columns}
        isActive={(r) => r.is_active}
        onAdd={can("org.process:create") ? openCreate : undefined}
        onEdit={can("org.process:update") ? openEdit : undefined}
        onSoftDelete={can("org.process:update") ? onSoftDelete : undefined}
        onHardDelete={can("org.process:delete") ? onHardDelete : undefined}
        onRestore={can("org.process:update") ? onRestore : undefined}
        addLabel="Nuevo proceso"
        onAfterChange={() => router.refresh()}
      />
      <EntityFormDialog
        open={modalState.open}
        onOpenChange={(open) => {
          if (!open) {
            crud.closeModal();
            resetForm();
          }
        }}
        title={modalState.editId === null ? "Nuevo proceso" : "Editar proceso"}
        busy={crud.busy}
        error={crud.error}
        onSubmit={onSubmit}
        onCancel={() => {
          crud.closeModal();
          resetForm();
        }}
        submitLabel={modalState.editId === null ? "Crear proceso" : "Guardar cambios"}
        sizeClassName="sm:max-w-lg"
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="process-code">Código *</Label>
              <Input
                id="process-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={32}
                disabled={crud.busy}
                placeholder="p. ej. WELD"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="process-name">Nombre *</Label>
              <Input
                id="process-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={160}
                disabled={crud.busy}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="process-description">Descripción</Label>
            <Textarea
              id="process-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={512}
              rows={3}
              disabled={crud.busy}
            />
          </div>
        </div>
      </EntityFormDialog>
    </>
  );
}
