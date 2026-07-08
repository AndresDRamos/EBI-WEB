import { notFound, redirect } from "next/navigation";
import { findAssetByCode } from "@/modules/maintenance/db";

export const dynamic = "force-dynamic";

/**
 * Redirect shim — equipment detail now lives in an expanding modal on
 * `/maintenance/machines`, not a full page. This route can't just disappear:
 * `cell-detail.tsx` links here, and printed QR labels already encode this
 * exact URL as their payload. Both keep working via the `?asset=` deep-link
 * that `MachinesCardsPage`/`DeepLinkOpener` reads to open the modal.
 */
export default async function MachineDetailRedirect({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const code = decodeURIComponent((await params).code);
  const asset = await findAssetByCode(code);
  if (!asset) notFound();
  redirect(`/maintenance/machines?asset=${encodeURIComponent(asset.code)}`);
}
