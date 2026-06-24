"use client";

import * as React from "react";
import { PowerBIEmbed, type EventHandler } from "powerbi-client-react";
import { models } from "powerbi-client";
import { useEmbedToken } from "@/lib/powerbi/use-embed-token";
import { buildVisualConfig } from "@/lib/powerbi/embed-config";
import { cn } from "@/lib/utils";

export interface EmbedVisualProps {
  workspaceGuid: string;
  reportGuid: string;
  pageName: string;
  visualName: string;
  className?: string;
}

/**
 * Embeds a single Power BI visual using `embedVisual` semantics (powerbi-client
 * `type: 'visual'`). Reuses the same mode-agnostic token seam as `EmbedReport`.
 */
export function EmbedVisual({
  workspaceGuid,
  reportGuid,
  pageName,
  visualName,
  className,
}: EmbedVisualProps) {
  const { token, status, error } = useEmbedToken();

  const eventHandlers = React.useMemo(
    () =>
      new Map<string, EventHandler>([
        [
          "error",
          (event) => {
             
            console.error("Power BI visual embed error:", event?.detail);
          },
        ],
      ]),
    [],
  );

  if (status === "loading" || status === "idle") {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md border bg-white text-xs text-muted-foreground",
          className,
        )}
      >
        Cargando visual…
      </div>
    );
  }
  if (status === "error") {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md border border-destructive/30 bg-orange-50 text-center text-xs text-destructive",
          className,
        )}
      >
        {error ?? "No se pudo cargar el visual."}
      </div>
    );
  }
  if (!token) {
    return null;
  }

  return (
    <PowerBIEmbed
      embedConfig={buildVisualConfig({
        workspaceGuid,
        reportGuid,
        accessToken: token.token,
        tokenType: token.tokenType as unknown as models.TokenType,
        pageName,
        visualName,
      })}
      eventHandlers={eventHandlers}
      cssClassName={cn("h-full w-full", className)}
    />
  );
}