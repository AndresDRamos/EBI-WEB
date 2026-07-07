import { NextResponse } from "next/server";
import { listFootprints } from "@/modules/production/db/footprint";
import { requireUser } from "@/lib/auth/rbac";
import { authErrorResponse } from "@/lib/auth/api";

/** GET /api/production/footprints — all footprints with asset refs (any user). */
export async function GET() {
  try {
    await requireUser();
    const footprints = await listFootprints();
    return NextResponse.json({ footprints });
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }
}
