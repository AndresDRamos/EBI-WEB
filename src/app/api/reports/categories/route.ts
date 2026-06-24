import { NextResponse, type NextRequest } from "next/server";
import { createCategory, listCategories } from "@/lib/db/reports";

/** GET /api/reports/categories */
export async function GET() {
  try {
    const categories = await listCategories();
    return NextResponse.json({ categories });
  } catch (err) {
     
    console.error("GET /api/reports/categories failed:", err);
    return NextResponse.json(
      { error: "No se pudieron obtener las categorías." },
      { status: 500 },
    );
  }
}

/** POST /api/reports/categories */
export async function POST(request: NextRequest) {
  let body: { name?: unknown; sort_order?: unknown };
  try {
    body = (await request.json()) as { name?: unknown; sort_order?: unknown };
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json(
      { error: "El nombre de la categoría es obligatorio." },
      { status: 422 },
    );
  }
  const sort_order = Number.isInteger(Number(body.sort_order))
    ? Number(body.sort_order)
    : 0;
  try {
    const category = await createCategory(name, sort_order);
    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
     
    console.error("POST /api/reports/categories failed:", err);
    return NextResponse.json(
      { error: "No se pudo crear la categoría." },
      { status: 500 },
    );
  }
}