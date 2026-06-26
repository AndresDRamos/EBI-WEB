"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface AdminDepartmentItem {
  department_id: number;
  name: string;
  is_active: boolean;
}

export function DepartmentsManager({
  departments,
}: {
  departments: AdminDepartmentItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "No se pudo crear.");
      return;
    }
    setName("");
    router.refresh();
  }

  async function toggleActive(id: number, active: boolean) {
    const res = await fetch(`/api/departments/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !active }),
    });
    if (res.ok) router.refresh();
  }

  async function remove(id: number) {
    if (!confirm("¿Eliminar este departamento del catálogo?")) return;
    const res = await fetch(`/api/departments/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "No se pudo eliminar.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={create}
        className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-4"
      >
        <div className="flex-1 space-y-2">
          <Label htmlFor="dept-name">Nombre</Label>
          <Input
            id="dept-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={160}
            disabled={busy}
          />
        </div>
        <Button type="submit" disabled={busy}>
          <Plus className="h-4 w-4" />
          Agregar
        </Button>
        {error ? (
          <p className="w-full text-sm text-destructive">{error}</p>
        ) : null}
      </form>

      <div className="overflow-hidden rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {departments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">
                  No hay departamentos registrados.
                </TableCell>
              </TableRow>
            ) : (
              departments.map((d) => (
                <TableRow key={d.department_id}>
                  <TableCell>{d.name}</TableCell>
                  <TableCell>
                    {d.is_active ? (
                      <Badge variant="success">Activo</Badge>
                    ) : (
                      <Badge variant="muted">Inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <label className="flex items-center gap-1 text-xs">
                        <Checkbox
                          checked={d.is_active}
                          onCheckedChange={() => toggleActive(d.department_id, d.is_active)}
                        />
                        Activo
                      </label>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => remove(d.department_id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}