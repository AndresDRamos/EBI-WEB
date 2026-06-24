import { NextResponse, type NextRequest } from "next/server";
import { updateCategory, deleteCategory } from "@/lib/db/reports";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  let body: { name?: unknown; sort_order?: unknown };
  try {
    body = (await request.json()) as { name?: unknown; sort_order?: unknown };
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const changes: { name?: string; sort_order?: number } = {};
  if (typeof body.name === "string" && body.name.trim()) {
    changes.name = body.name.trim();
  }
  if (Number.isInteger(Number(body.sort_order))) {
    changes.sort_order = Number(body.sort_order);
  }
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "Sin cambios." }, { status: 422 });
  }
  try {
    await updateCategory(id, changes);
    return NextResponse.json({ ok: true });
  } catch (err) {
     
    console.error("PUT /api/reports/categories/[id] failed:", err);
    return NextResponse.json(
      { error: "No se pudo actualizar la categoría." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  try {
    await deleteCategory(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
     
    console.error("DELETE /api/reports/categories/[id] failed:", err);
    return NextResponse.json(
      { error: "No se pudo eliminar la categoría (¿tiene reportes asociados?)." },
      { status: 409 },
    );
  }
}