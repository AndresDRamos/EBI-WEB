import { redirect } from "next/navigation";

/** `/planning` has a single page in v1 — send it straight to the sequencer. */
export default function PlanningIndex() {
  redirect("/planning/laser-sequencing");
}
