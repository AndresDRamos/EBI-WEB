import { headers } from "next/headers";
import QRCode from "qrcode";

/** Public origin of this request — env override first, else the forwarded host. */
export async function resolveBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3001";
  return `${proto}://${host}`;
}

/**
 * QR label payload for an asset — the same target URL that resolves via the
 * `[code]/page.tsx` redirect shim, so a physically printed label keeps
 * scanning correctly regardless of how the portal renders that route.
 */
export async function buildAssetQrDataUrl(code: string): Promise<string> {
  const baseUrl = await resolveBaseUrl();
  const target = `${baseUrl}/maintenance/machines/${encodeURIComponent(code)}`;
  return QRCode.toDataURL(target, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 440,
    color: { dark: "#373a36", light: "#ffffff" },
  });
}
