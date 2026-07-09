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
import { Button, buttonVariants } from "@/components/ui/button";
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
 * etiqueta" opens the browser print dialog right here (no navigation): a
 * hidden iframe loads the proven printable `/label` route and prints it once
 * loaded.
 */
export function QrModal({ assetId, code, name, onClose }: QrModalProps) {
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [printing, setPrinting] = React.useState(false);
  const printFrameRef = React.useRef<HTMLIFrameElement | null>(null);

  function printLabel() {
    if (printing) return;
    setPrinting(true);
    // Reuse one hidden iframe per modal instance; the label route carries its
    // own print stylesheet, so printing its window prints only the label.
    let frame = printFrameRef.current;
    if (!frame) {
      frame = document.createElement("iframe");
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "0";
      frame.style.height = "0";
      frame.style.border = "0";
      frame.setAttribute("aria-hidden", "true");
      document.body.appendChild(frame);
      printFrameRef.current = frame;
    }
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } finally {
        setPrinting(false);
      }
    };
    frame.src = `/maintenance/machines/${encodeURIComponent(code)}/label`;
  }

  React.useEffect(() => {
    return () => {
      printFrameRef.current?.remove();
      printFrameRef.current = null;
    };
  }, []);

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
          <Button onClick={printLabel} disabled={printing}>
            <Printer className="h-4 w-4" />
            {printing ? "Preparando…" : "Imprimir etiqueta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
