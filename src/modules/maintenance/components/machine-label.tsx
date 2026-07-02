"use client";

import Image from "next/image";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface MachineLabelProps {
  code: string;
  name: string;
  plantName: string;
  qrDataUrl: string;
}

/**
 * Printable QR label for an asset. The QR encodes the portal URL of the
 * machine detail page, so scanning it on the floor lands on this asset
 * (authenticated, role-gated). Print-friendly: only the label prints.
 */
export function MachineLabel({
  code,
  name,
  plantName,
  qrDataUrl,
}: MachineLabelProps) {
  return (
    <div className="flex flex-col items-center gap-6 py-8 print:py-0">
      <div className="print:hidden">
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Imprimir etiqueta
        </Button>
      </div>

      <div
        className="flex w-80 flex-col overflow-hidden rounded-lg border-2 border-ezi-gray bg-white print:rounded-none print:border"
        style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
      >
        <div className="bg-ezi-gray px-4 py-2 text-center">
          <span className="text-sm font-bold uppercase tracking-widest text-white">
            EZI Metales
          </span>
        </div>
        <div className="flex flex-col items-center gap-3 p-5">
          <Image
            src={qrDataUrl}
            alt={`QR del equipo ${code}`}
            width={220}
            height={220}
            unoptimized
            className="h-56 w-56"
          />
          <div className="w-full border-t-2 border-ezi-orange pt-3 text-center">
            <p className="font-mono text-2xl font-bold text-ezi-gray">{code}</p>
            <p className="mt-1 text-sm font-medium text-ezi-gray">{name}</p>
            <p className="mt-0.5 text-xs uppercase tracking-wide text-gray-500">
              {plantName}
            </p>
          </div>
        </div>
      </div>

      <p className="max-w-md text-center text-xs text-muted-foreground print:hidden">
        Escanea el código para abrir la ficha del equipo en el portal. El acceso
        requiere sesión y las acciones dependen del rol del usuario.
      </p>
    </div>
  );
}
