"use client";

import * as React from "react";
import { Download, Printer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface QrModalProps {
  assetId: number;
  code: string;
  name: string;
  onClose: () => void;
}

/**
 * QR label preview stacked above the equipment modal — fetches the dataURL
 * on open instead of navigating to the printable `/label` route. "Imprimir
 * etiqueta" still opens that route in a new tab: it already has a proven
 * print stylesheet, no reason to duplicate that logic here.
 */
export function QrModal({ assetId, code, name, onClose }: QrModalProps) {
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/maintenance/assets/${assetId}/qr`)
      .then(async (res) => {
        if (!res.ok) throw new Error("No se pudo generar el código QR.");
        return (await res.json()) as { qrDataUrl: string };
      })
      .then((d) => {
        if (!cancelled) setQrDataUrl(d.qrDataUrl);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error inesperado.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Etiqueta QR</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 rounded-lg border p-6">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- dataURL, not optimizable
            <img
              src={qrDataUrl}
              alt={`QR ${code}`}
              className="h-44 w-44"
              style={{ imageRendering: "pixelated" }}
            />
          ) : (
            <div className="h-44 w-44 animate-pulse rounded-md bg-gray-100" />
          )}
          <p className="text-center text-sm font-semibold">{name}</p>
          <p className="font-mono text-xs text-muted-foreground">{code}</p>
        </div>
        <DialogFooter>
          <a
            href={qrDataUrl ?? undefined}
            download={`QR-${code}.png`}
            aria-disabled={!qrDataUrl}
            className={cn(
              buttonVariants({ variant: "outline" }),
              !qrDataUrl && "pointer-events-none opacity-40",
            )}
          >
            <Download className="h-4 w-4" />
            Descargar PNG
          </a>
          <a
            href={`/maintenance/machines/${encodeURIComponent(code)}/label`}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "default" }))}
          >
            <Printer className="h-4 w-4" />
            Imprimir etiqueta
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
