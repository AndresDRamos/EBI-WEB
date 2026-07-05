"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wrench } from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { Badge } from "@/components/ui/badge";
import { useCan } from "@/components/providers/permissions-provider";
import {
  MachineFormDialog,
  type MachineFormAsset,
  type PlantOption,
  type ParentOption,
} from "@/modules/maintenance/components/machine-form-dialog";
import { assetCategoryLabel, statusLabel } from "@/modules/maintenance/enums";

export interface MachinesTableRow {
  asset_id: number;
  code: string;
  name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  plant_id: number;
  plant_name: string;
  location: string | null;
  criticality: string;
  status: string;
  asset_category: string;
  parent_asset_id: number | null;
  acquisition_date: string | null;
  notes: string | null;
  process_names: string[];
  is_active: boolean;
}

export interface MachinesTablePageProps {
  machines: MachinesTableRow[];
  plants: PlantOption[];
}

/** Equipos list — the maintenance asset catalog. Actions gate per-permission
 * via `useCan` (plan 0006); the API re-checks server-side. */
export function MachinesTablePage({
  machines,
  plants,
}: MachinesTablePageProps) {
  const can = useCan();
  const router = useRouter();
  const [modal, setModal] = React.useState<{
    open: boolean;
    edit: MachineFormAsset | null;
  }>({ open: false, edit: null });

  const parentOptions: ParentOption[] = machines.map((m) => ({
    asset_id: m.asset_id,
    code: m.code,
    name: m.name,
  }));

  async function onSoftDelete(
    row: MachinesTableRow,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/maintenance/assets/${row.asset_id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: d.error ?? "No se pudo desactivar el equipo." };
    }
    router.refresh();
    return { ok: true };
  }

  async function onRestore(
    row: MachinesTableRow,
  ): Promise<{ ok?: boolean; error?: string }> {
    const res = await fetch(`/api/maintenance/assets/${row.asset_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: d.error ?? "No se pudo reactivar el equipo." };
    }
    router.refresh();
    return { ok: true };
  }

  const plantOptions = [...new Set(machines.map((m) => m.plant_name))].map(
    (name) => ({ value: name, label: name }),
  );
  const statusOptions = [...new Set(machines.map((m) => m.status))].map(
    (s) => ({ value: s, label: statusLabel(s) }),
  );
  const categoryOptions = [...new Set(machines.map((m) => m.asset_category))].map(
    (c) => ({ value: c, label: assetCategoryLabel(c) }),
  );

  const columns: ColumnDef<MachinesTableRow>[] = React.useMemo(
    () => [
      {
        key: "code",
        header: "Código",
        accessor: (r) => r.code,
        filter: { kind: "text" },
        render: (r) => (
          <Link
            href={`/maintenance/machines/${encodeURIComponent(r.code)}`}
            className="font-mono font-medium text-ezi-gray underline-offset-2 hover:text-ezi-orange hover:underline"
          >
            {r.code}
          </Link>
        ),
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
        key: "brand_model",
        header: "Marca / Modelo",
        accessor: (r) => [r.brand ?? "", r.model ?? ""],
        filter: { kind: "text" },
        render: (r) =>
          r.brand || r.model ? (
            <span>
              {r.brand ?? "—"}
              {r.model ? (
                <span className="text-muted-foreground"> · {r.model}</span>
              ) : null}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "plant",
        header: "Planta",
        accessor: (r) => r.plant_name,
        filter: { kind: "catalog", options: plantOptions },
        className: "w-40",
      },
      {
        key: "processes",
        header: "Procesos",
        accessor: (r) => r.process_names,
        filter: { kind: "text" },
      },
      {
        key: "category",
        header: "Categoría",
        accessor: (r) => assetCategoryLabel(r.asset_category),
        filter: { kind: "catalog", options: categoryOptions },
        className: "w-40",
      },
      {
        key: "criticality",
        header: "Criticidad",
        accessor: (r) => r.criticality,
        filter: {
          kind: "catalog",
          options: [
            { value: "A", label: "A (alta)" },
            { value: "B", label: "B (media)" },
            { value: "C", label: "C (baja)" },
          ],
        },
        render: (r) => <CriticalityBadge value={r.criticality} />,
        className: "w-28",
      },
      {
        key: "status",
        header: "Estatus",
        accessor: (r) => statusLabel(r.status),
        filter: { kind: "catalog", options: statusOptions },
        render: (r) => <StatusBadge value={r.status} />,
        className: "w-36",
      },
    ],
    [plantOptions, statusOptions, categoryOptions],
  );

  return (
    <>
      <DataTable
        icon={Wrench}
        title="Equipos"
        subtitle="Catálogo de activos de manufactura. El código del equipo es el contenido de su etiqueta QR."
        rows={machines}
        getRowId={(r) => r.asset_id}
        columns={columns}
        isActive={(r) => r.is_active}
        onAdd={
          can("maintenance.asset:create")
            ? () => setModal({ open: true, edit: null })
            : undefined
        }
        onEdit={
          can("maintenance.asset:update")
            ? (row) => setModal({ open: true, edit: row })
            : undefined
        }
        onSoftDelete={can("maintenance.asset:delete") ? onSoftDelete : undefined}
        onRestore={can("maintenance.asset:update") ? onRestore : undefined}
        addLabel="Nuevo equipo"
        onAfterChange={() => router.refresh()}
      />
      <MachineFormDialog
        open={modal.open}
        asset={modal.edit}
        plants={plants}
        parents={parentOptions}
        onOpenChange={(open) =>
          setModal((prev) => ({ open, edit: open ? prev.edit : null }))
        }
        onSaved={() => {
          setModal({ open: false, edit: null });
          router.refresh();
        }}
      />
    </>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const tone =
    value === "active"
      ? "border-green-200 bg-green-50 text-green-700"
      : value === "in_repair"
        ? "border-orange-200 bg-orange-50 text-ezi-orange"
        : value === "standby"
          ? "border-gray-200 bg-gray-50 text-gray-600"
          : "border-gray-300 bg-gray-100 text-gray-500";
  return (
    <Badge variant="outline" className={tone}>
      {statusLabel(value)}
    </Badge>
  );
}

export function CriticalityBadge({ value }: { value: string }) {
  const tone =
    value === "A"
      ? "border-red-200 bg-red-50 text-red-700"
      : value === "B"
        ? "border-orange-200 bg-orange-50 text-ezi-orange"
        : "border-gray-200 bg-gray-50 text-gray-600";
  return (
    <Badge variant="outline" className={tone}>
      {value}
    </Badge>
  );
}
