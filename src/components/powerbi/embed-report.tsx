"use client";

import * as React from "react";
import { PowerBIEmbed, type EventHandler } from "powerbi-client-react";
import { Report, models } from "powerbi-client";
import { useEmbedToken } from "@/lib/powerbi/use-embed-token";
import { buildReportConfig } from "@/lib/powerbi/embed-config";
import { cn } from "@/lib/utils";

export interface EmbedReportProps {
  workspaceGuid: string;
  reportGuid: string;
  pageName?: string;
  className?: string;
  /** Receives the embedded Report instance once loaded. */
  onReportReady?: (report: Report) => void;
}

/**
 * Embeds a full Power BI report. Mode-agnostic: the token type is decided by
 * `useEmbedToken` (Aad in dev/PPU, Embed in prod/capacity). The embed component
 * itself is never forked.
 */
export function EmbedReport({
  workspaceGuid,
  reportGuid,
  pageName,
  className,
  onReportReady,
}: EmbedReportProps) {
  const { token, status, error } = useEmbedToken();

  const eventHandlers = React.useMemo(
    () =>
      new Map<string, EventHandler>([
        [
          "loaded",
          (_event, embedded) => {
            onReportReady?.(embedded as Report);
          },
        ],
        [
          "error",
          (event) => {
            console.error("Power BI embed error:", event?.detail);
          },
        ],
      ]),
    [onReportReady],
  );

  if (status === "loading" || status === "idle") {
    return <EmbedSkeleton label="Cargando reporte…" className={className} />;
  }
  if (status === "error") {
    return (
      <EmbedError
        message={error ?? "No se pudo cargar el reporte."}
        className={className}
      />
    );
  }
  if (!token) {
    return null;
  }

  return (
    <div className={cn("h-full w-full", className)}>
      <PowerBIEmbed
        embedConfig={buildReportConfig({
          workspaceGuid,
          reportGuid,
          accessToken: token.token,
          tokenType: token.tokenType as unknown as models.TokenType,
          pageName,
        })}
        eventHandlers={eventHandlers}
        cssClassName="h-full w-full"
      />
    </div>
  );
}

function EmbedSkeleton({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-md border bg-white text-sm text-muted-foreground",
        className,
      )}
    >
      {label}
    </div>
  );
}

function EmbedError({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-md border border-destructive/30 bg-orange-50 p-6 text-center text-sm text-destructive",
        className,
      )}
    >
      {message}
    </div>
  );
}