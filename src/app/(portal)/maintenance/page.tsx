import { redirect } from "next/navigation";

/** Mantenimiento landing → asset catalog. */
export default function MaintenancePage() {
  redirect("/maintenance/machines");
}
