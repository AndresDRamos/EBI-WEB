import { redirect } from "next/navigation";

/** Producción landing → cell catalog. */
export default function ProductionPage() {
  redirect("/production/cells");
}
