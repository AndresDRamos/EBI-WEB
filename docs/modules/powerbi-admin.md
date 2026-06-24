# Module — Power BI report admin

**Milestone 1.** First module: replaces the public "Publish to web" URLs with an
authenticated, administrable catalog of embedded reports.

## Scope

- Dashboard list backed by `dbo.report` / `dbo.report_category` in `EBI_dev`.
- Embedded view of a full report and of individual visuals (`embedVisual`).
- Cross-report drill-through and portal-level navigation (`setPage`, bookmarks, filters).
- Admin CRUD for report metadata (name, workspace/report/dataset GUIDs, category, order, active).

## Key pieces

- UI: `src/app/(portal)/dashboards`, `src/app/(portal)/admin`.
- Embedding: `src/lib/powerbi/` + `EmbedReport`, `EmbedVisual`, `NavDrillthrough`
  (see `pbi-embed` sub-agent and ADR 0001).
- Data access: `src/lib/db/` (Kysely) reading/writing `dbo.report*` with `ebi_app`.

## Embedding mode

- Dev: `tokenType: Aad` (owner PPU). Prod: `tokenType: Embed` via service principal.
  No component fork — only `getEmbedToken()`.

## Notes

- Disable "Publish to web" at the tenant level once this module is live.
