"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface AdminReportRow {
  report_id: number;
  name: string;
  category_name: string | null;
  sort_order: number;
  is_active: boolean;
  updated_at: string;
}

export function ReportAdminTable({
  rows,
}: {
  rows: AdminReportRow[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<number | null>(null);

  async function toggle(id: number, active: boolean) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw new Error("toggle failed");
      router.refresh();
    } catch (err) {
       
      console.error(err);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: number) {
    if (!confirm("¿Eliminar este reporte del catálogo?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/reports/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      router.refresh();
    } catch (err) {
       
      console.error(err);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="font-semibold">Reportes</h2>
        <Link
          href="/admin/reports/new"
          className="inline-flex h-8 items-center gap-2 rounded-sm bg-ezi-orange px-3 text-xs font-medium text-white transition-colors hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          Nuevo reporte
        </Link>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Orden</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Actualizado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                No hay reportes registrados.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.report_id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>{row.category_name ?? "—"}</TableCell>
                <TableCell>{row.sort_order}</TableCell>
                <TableCell>
                  {row.is_active ? (
                    <Badge variant="success" style={{ backgroundColor: "var(--color-success)" }}>
                      Activo
                    </Badge>
                  ) : (
                    <Badge variant="muted">Inactivo</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(row.updated_at).toLocaleString("es-MX")}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/admin/reports/${row.report_id}/edit`}
                      className="inline-flex h-8 items-center gap-2 rounded-sm border bg-background px-3 text-xs font-medium transition-colors hover:bg-gray-100"
                    >
                      <Pencil className="h-4 w-4" />
                      Editar
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === row.report_id}
                      onClick={() =>
                        toggle(row.report_id, !row.is_active)
                      }
                    >
                      {row.is_active ? "Desactivar" : "Activar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busyId === row.report_id}
                      onClick={() => remove(row.report_id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}