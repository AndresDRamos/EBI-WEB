"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

export interface ReportFormCategory {
  category_id: number;
  name: string;
}

export interface ReportFormInitial {
  report_id: number;
  name: string;
  workspace_guid: string;
  report_guid: string;
  dataset_guid: string | null;
  category_id: number | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface ReportFormProps {
  categories: ReportFormCategory[];
  initial?: ReportFormInitial;
}

export function ReportForm({ categories, initial }: ReportFormProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState(initial?.name ?? "");
  const [workspaceGuid, setWorkspaceGuid] = React.useState(
    initial?.workspace_guid ?? "",
  );
  const [reportGuid, setReportGuid] = React.useState(
    initial?.report_guid ?? "",
  );
  const [datasetGuid, setDatasetGuid] = React.useState(
    initial?.dataset_guid ?? "",
  );
  const [categoryId, setCategoryId] = React.useState<string>(
    initial?.category_id != null ? String(initial.category_id) : "",
  );
  const [description, setDescription] = React.useState(
    initial?.description ?? "",
  );
  const [sortOrder, setSortOrder] = React.useState(
    String(initial?.sort_order ?? 0),
  );
  const [isActive, setIsActive] = React.useState(initial?.is_active ?? true);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const payload = {
      name: name.trim(),
      workspace_guid: workspaceGuid.trim(),
      report_guid: reportGuid.trim(),
      dataset_guid: datasetGuid.trim() || null,
      category_id: categoryId ? Number(categoryId) : null,
      description: description.trim() || null,
      sort_order: Number(sortOrder) || 0,
      is_active: isActive,
    };

    const isEdit = Boolean(initial);
    const url = isEdit
      ? `/api/reports/${initial!.report_id}`
      : "/api/reports";
    const method = isEdit ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? "Error al guardar el reporte.");
      }
      router.push("/admin/reports");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={200}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="workspace_guid">GUID de workspace *</Label>
          <Input
            id="workspace_guid"
            value={workspaceGuid}
            onChange={(e) => setWorkspaceGuid(e.target.value)}
            required
            maxLength={64}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="report_guid">GUID de reporte *</Label>
          <Input
            id="report_guid"
            value={reportGuid}
            onChange={(e) => setReportGuid(e.target.value)}
            required
            maxLength={64}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="dataset_guid">GUID de dataset (opcional)</Label>
          <Input
            id="dataset_guid"
            value={datasetGuid}
            onChange={(e) => setDatasetGuid(e.target.value)}
            maxLength={64}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category_id">Categoría</Label>
          <Select
            id="category_id"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.category_id} value={c.category_id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descripción (opcional)</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
        />
      </div>

      <div className="flex items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="sort_order">Orden</Label>
          <Input
            id="sort_order"
            type="number"
            min={0}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={isActive}
            onCheckedChange={setIsActive}
          />
          Activo
        </label>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Guardando…" : initial ? "Guardar cambios" : "Crear reporte"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/reports")}
          disabled={busy}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}