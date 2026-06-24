import { models } from "powerbi-client";
import type {
  IReportEmbedConfiguration,
  IVisualEmbedConfiguration,
} from "powerbi-client";

/**
 * Helpers to build Power BI embed configurations.
 *
 * The embed CONFIG is mode-agnostic — only the access token differs by mode
 * (see `use-embed-token.tsx`). Dev (org-embed) uses the user's AAD token and
 * `TokenType.Aad`. Production (capacity, app-owns-data) will use a service-
 * principal-generated embed token and `TokenType.Embed` (Milestone 3).
 */

/** Org-embed (user owns data) report URL for the public Power BI service. */
export function reportEmbedUrl(workspaceGuid: string, reportGuid: string): string {
  return `https://app.powerbi.com/reportEmbed?reportId=${encodeURIComponent(
    reportGuid,
  )}&groupId=${encodeURIComponent(workspaceGuid)}`;
}

export interface BuildReportConfigArgs {
  workspaceGuid: string;
  reportGuid: string;
  accessToken: string;
  pageName?: string;
  tokenType?: models.TokenType;
}

export function buildReportConfig(
  args: BuildReportConfigArgs,
): IReportEmbedConfiguration {
  return {
    type: "report",
    tokenType: args.tokenType ?? models.TokenType.Aad,
    accessToken: args.accessToken,
    embedUrl: reportEmbedUrl(args.workspaceGuid, args.reportGuid),
    id: args.reportGuid,
    pageName: args.pageName,
    permissions: models.Permissions.Read,
    viewMode: models.ViewMode.View,
    settings: {
      panes: {
        filters: { expanded: false, visible: false },
        pageNavigation: { visible: false },
      },
      bars: { statusBar: { visible: false } },
      background: models.BackgroundType.Transparent,
    },
  };
}

export interface BuildVisualConfigArgs {
  workspaceGuid: string;
  reportGuid: string;
  accessToken: string;
  pageName: string;
  visualName: string;
  tokenType?: models.TokenType;
}

export function buildVisualConfig(
  args: BuildVisualConfigArgs,
): IVisualEmbedConfiguration {
  return {
    type: "visual",
    tokenType: args.tokenType ?? models.TokenType.Aad,
    accessToken: args.accessToken,
    embedUrl: reportEmbedUrl(args.workspaceGuid, args.reportGuid),
    id: args.reportGuid,
    pageName: args.pageName,
    visualName: args.visualName,
  };
}

/** Default report settings used by `EmbedReport` when none are provided. */
export const defaultReportSettings: IReportEmbedConfiguration["settings"] = {
  panes: {
    filters: { expanded: false, visible: false },
    pageNavigation: { visible: false },
  },
  bars: { statusBar: { visible: false } },
};