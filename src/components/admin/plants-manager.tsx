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

export interface AdminPlantItem {
  plant_id: number;
  code: string;
  name: string;
  is_active: boolean;
}

export function PlantsManager({ plants }: { plants: AdminPlantItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!code.trim() || !name.trim()) {
      setError("Código y nombre son obligatorios.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/plants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim(), name: name.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "No se pudo crear.");
      return;
    }
    setCode("");
    setName("");
    router.refresh();
  }

  async function toggleActive(id: number, active: boolean) {
    const res = await fetch(`/api/plants/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !active }),
    });
    if (res.ok) router.refresh();
  }

  async function remove(id: number) {
    if (!confirm("¿Eliminar esta planta del catálogo?")) return;
    const res = await fetch(`/api/plants/${id}`, { method: "DELETE" });
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
        <div className="space-y-2">
          <Label htmlFor="plant-code">Código</Label>
          <Input
            id="plant-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={32}
            disabled={busy}
          />
        </div>
        <div className="flex-1 space-y-2">
          <Label htmlFor="plant-name">Nombre</Label>
          <Input
            id="plant-name"
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
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  No hay plantas registradas.
                </TableCell>
              </TableRow>
            ) : (
              plants.map((p) => (
                <TableRow key={p.plant_id}>
                  <TableCell className="font-mono">{p.code}</TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell>
                    {p.is_active ? (
                      <Badge variant="success">Activa</Badge>
                    ) : (
                      <Badge variant="muted">Inactiva</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <label className="flex items-center gap-1 text-xs">
                        <Checkbox
                          checked={p.is_active}
                          onCheckedChange={() => toggleActive(p.plant_id, p.is_active)}
                        />
                        Activa
                      </label>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => remove(p.plant_id)}
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