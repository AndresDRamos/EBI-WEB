"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Factory } from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EntityFormDialog } from "@/components/kit/entity-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface PlantsTableRow {
  plant_id: number;
  code: string;
  name: string;
  address: string | null;
  postal_code: string | null;
  is_active: boolean;
}

export interface PlantsTablePageProps {
  plants: PlantsTableRow[];
}

/** Plantas admin table — CRUD with address + postal_code. */
export function PlantsTablePage({ plants }: PlantsTablePageProps) {
  const router = useRouter();
  const [modalState, setModalState] = React.useState<{
    open: boolean;
    editId: number | null;
  }>({ open: false, editId: null });

  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [postalCode, setPostalCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  function resetForm() {
    setCode("");
    setName("");
    setAddress("");
    setPostalCode("");
    setError(null);
  }

  function openCreate() {
    resetForm();
    setModalState({ open: true, editId: null });
  }

  function openEdit(row: PlantsTableRow) {
    setCode(row.code);
    setName(row.name);
    setAddress(row.address ?? "");
    setPostalCode(row.postal_code ?? "");
    setError(null);
    setModalState({ open: true, editId: row.plant_id });
  }

  async function onSubmit() {
    setError(null);
    if (!code.trim() || !name.trim()) {
      setError("Código y nombre son obligatorios.");
      return;
    }
    setBusy(true);
    try {
      const id = modalState.editId;
      const url = id ? `/api/plants/${id}` : "/api/plants";
      const method = id ? "PUT" : "POST";
      const body = JSON.stringify({
        code: code.trim(),
        name: name.trim(),
        address: address.trim() || null,
        postal_code: postalCode.trim() || null,
      });
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo guardar la planta.");
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

  async function onSoftDelete(
    row: PlantsTableRow,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/plants/${row.plant_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: d.error ?? "No se pudo desactivar la planta." };
    }
    router.refresh();
    return { ok: true };
  }

  async function onHardDelete(
    row: PlantsTableRow,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/plants/${row.plant_id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return {
        ok: false,
        error:
          d.error ??
          "No se pudo eliminar la planta (¿tiene usuarios asignados?).",
      };
    }
    router.refresh();
    return { ok: true };
  }

  async function onRestore(
    row: PlantsTableRow,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/plants/${row.plant_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: d.error ?? "No se pudo reactivar la planta." };
    }
    router.refresh();
    return { ok: true };
  }

  const columns: ColumnDef<PlantsTableRow>[] = React.useMemo(
    () => [
      {
        key: "name",
        header: "Nombre",
        accessor: (r) => r.name,
        filter: { kind: "text" },
        render: (r) => <span className="font-medium">{r.name}</span>,
      },
      {
        key: "code",
        header: "Código",
        accessor: (r) => r.code,
        filter: { kind: "text" },
        render: (r) => <span className="font-mono">{r.code}</span>,
        className: "w-32",
      },
      {
        key: "address",
        header: "Dirección",
        accessor: (r) => r.address ?? "",
        filter: { kind: "text" },
        render: (r) =>
          r.address ? (
            <span className="whitespace-normal">{r.address}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        className: "min-w-[20rem]",
      },
      {
        key: "postal_code",
        header: "Código postal",
        accessor: (r) => r.postal_code ?? "",
        filter: { kind: "text" },
        render: (r) =>
          r.postal_code ? (
            <span className="font-mono">{r.postal_code}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        className: "w-32",
      },
    ],
    [],
  );

  return (
    <>
      <DataTable
        icon={Factory}
        title="Plantas"
        subtitle="Catálogo de plantas. Asignar a los usuarios acota su alcance de datos (futuro RLS vía Power BI)."
        rows={plants}
        getRowId={(r) => r.plant_id}
        columns={columns}
        isActive={(r) => r.is_active}
        onAdd={openCreate}
        onEdit={openEdit}
        onSoftDelete={onSoftDelete}
        onHardDelete={onHardDelete}
        onRestore={onRestore}
        canDelete={() => true}
        addLabel="Nueva planta"
        onAfterChange={() => router.refresh()}
      />
      <EntityFormDialog
        open={modalState.open}
        onOpenChange={(open) => {
          setModalState((prev) => ({ open, editId: open ? prev.editId : null }));
          if (!open) resetForm();
        }}
        title={modalState.editId === null ? "Nueva planta" : "Editar planta"}
        busy={busy}
        error={error}
        onSubmit={onSubmit}
        onCancel={() => {
          setModalState({ open: false, editId: null });
          resetForm();
        }}
        submitLabel={modalState.editId === null ? "Crear planta" : "Guardar cambios"}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="plant-code">Código *</Label>
              <Input
                id="plant-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={32}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plant-name">Nombre *</Label>
              <Input
                id="plant-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={160}
                disabled={busy}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="plant-address">Dirección</Label>
            <Input
              id="plant-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={256}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plant-postal">Código postal</Label>
            <Input
              id="plant-postal"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              maxLength={16}
              disabled={busy}
            />
          </div>
        </div>
      </EntityFormDialog>
    </>
  );
}