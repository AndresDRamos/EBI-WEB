"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export interface CategoryManagerRow {
  category_id: number;
  name: string;
  sort_order: number;
}

export function CategoryManager({
  categories,
}: {
  categories: CategoryManagerRow[];
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [sortOrder, setSortOrder] = React.useState("0");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          sort_order: Number(sortOrder) || 0,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? "Error al crear la categoría.");
      }
      setName("");
      setSortOrder("0");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("¿Eliminar esta categoría?")) return;
    const res = await fetch(`/api/reports/categories/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      alert(data.error ?? "No se pudo eliminar la categoría.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-lg border bg-white p-4">
      <h2 className="font-semibold">Categorías</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Agrupan los reportes en el catálogo del portal.
      </p>

      <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="cat-name">Nombre</Label>
          <Input
            id="cat-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="p. ej. Producción"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cat-sort">Orden</Label>
          <Input
            id="cat-sort"
            type="number"
            min={0}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="w-24"
          />
        </div>
        <Button type="submit" disabled={busy}>
          Agregar
        </Button>
      </form>
      {error ? (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      ) : null}

      <Separator className="my-4" />

      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay categorías. Los reportes sin categoría aparecen en “Sin
          categoría”.
        </p>
      ) : (
        <ul className="divide-y">
          {categories.map((c) => (
            <li
              key={c.category_id}
              className="flex items-center justify-between py-2 text-sm"
            >
              <span>
                {c.name}{" "}
                <span className="text-muted-foreground">
                  (orden {c.sort_order})
                </span>
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => remove(c.category_id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}