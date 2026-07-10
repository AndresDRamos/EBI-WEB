---
id: ui-monoliths-decomposition
status: committed
created: 2026-07-10
touches: [org, production, maintenance, kit]
migrations: []
supersedes: null
superseded_by: null
---

# Descomponer los 3 monolitos

## Objective

Three UI files had grown well past the point a single-file mental model holds
up (`permission-manager.tsx` ~1450 lines, `location-cells-modal.tsx` ~1130,
`machine-modal.tsx` ~986), plus `src/components/kit/data-table.tsx` (~874,
shared by every admin table). This plan (tracked as 8 tasks in Notion, "4-
Descomponer los 3 monolitos") splits each into an orchestrator + sibling
files along their natural seams, fixes one real correctness issue found along
the way (a setState-during-render watchdog in `CellDetailView`), reframes
`NavAccessTree`'s state from 4 loosely-synced maps into one normalized
structure, and extracts a small "kit medio" of shared components
(`ConfirmDialog`, `EmptyState`, `SectionHeader`, a `ghost-ezi` button variant,
semantic badge variants) that the decompositions — and a dozen other
call-sites — were duplicating by hand. No schema changes, no behavior
changes intended anywhere.

## Steps

1. **Kit medio** (`src/components/kit/confirm-dialog.tsx`, `empty-state.tsx`,
   `section-header.tsx`, `kit-table-header-band.tsx`; `ghost-ezi` variant +
   `icon-xs`/`icon-sm`/`icon-md` sizes in `ui/button.tsx`; `warning`/`error`/
   `info` variants + a fixed `success` in `ui/badge.tsx`) — done first since
   every later step consumes it. Applied at the call sites the duplication
   survey found: `machines-cards-page.tsx`, `machine-standalone-view.tsx`,
   `location-cells-modal.tsx`, `permission-manager.tsx`, `data-table.tsx`
   (`ConfirmDialog`); `plant-processes-page.tsx`, `machine-cards.tsx`,
   `user-form.tsx`, `app/(portal)/page.tsx` (`EmptyState`);
   `plant-processes-page.tsx`, `permission-manager.tsx`,
   `layout-editor-page.tsx` (`SectionHeader`); 8 icon-button call sites
   (`ghost-ezi`); `validation-report-view.tsx` + the two `success`-badge call
   sites (badge variants); 4 layout-editor files (`text-red-600` →
   `text-destructive` + `role="alert"`).
2. **`permission-manager.tsx`** split into orchestrator (`PermissionManager`,
   `FilterBar`, shared types) + `permissions-panel.tsx` + `nav-access-tree.tsx`
   + `section-edit-dialog.tsx` (+ shared `IconPickerField`) +
   `item-edit-dialog.tsx`. Pure move, no state changes.
3. **`NavAccessTree`** state reframed: `itemGrants` + `itemsBySection` +
   `childrenByItem` (3 of the original 4 maps) collapsed into one
   `sectionState: Map<sectionId, {topOrder, childOrder, grants}>`, built once
   by a pure `buildSectionState()` — no more `buildOrder`, no more
   `eslint-disable react-hooks/exhaustive-deps` (the effect now honestly
   depends on `items`/`sections` too, which is more correct: a nav edit's
   `router.refresh()` now properly rebuilds the tree even without a role
   switch). The O(n²) `displaySectionOrder.filter().indexOf()` per row became
   a `visibleRank` computed once via `useMemo`.
4. **`location-cells-modal.tsx`** split into orchestrator + `cell-detail-view.tsx`
   + `cell-composition.tsx` + `cell-form-dialog.tsx`. The shared `reorder<T>`
   (duplicated with the nav tree) moved to `src/lib/reorder.ts`. Fixed the
   `CellDetailView` setState-during-render watchdog (`prevIdsKey` computed
   inline during render) — the caller now passes
   `key={`${cellId}:${sortedChildIds}`}`, so a full remount does the reset
   instead.
5. **`machine-modal.tsx`** split into orchestrator + `machine-summary-fields.tsx`
   (`SummaryFields`) + new hook `use-cell-assignment.ts` (`useCellAssignment`,
   extracted from the modal's inline pending-cell-choice state + the
   close/open `asset_cell_assignment` fetch logic).
6. **`data-table.tsx`** split into orchestrator + `data-table-filter.tsx` +
   `data-table-actions.tsx` + `data-table-paginator.tsx`; `grouped-data-table.tsx`
   now imports `ActionsCell` from `data-table-actions.tsx` directly and both
   tables render their header band via the new `KitTableHeaderBand`.

## Database impact

None — pure TypeScript/React refactor, no schema changes, no migrations.

## Amendments

- 2026-07-10 — Executed end-to-end in one session (branch
  `claude/notion-tasks-execution-6b727e`). `pnpm lint` and `pnpm build` pass
  after every step and again at the end. The Claude Preview tool was
  unavailable for this entire session (`preview_start`/`preview_list` never
  returned a live server, across many retries — likely contention from other
  parallel sessions in this same repo) — visual/interactive smoke (drag &
  drop, toggles, dialogs) could not be done through it. Substituted: a
  manually-started `pnpm dev` + `curl`-based login (test user `tester`) +
  fetch of every touched route (`/admin/portal/permissions`,
  `/production/operative-cells`, `/maintenance/machines`,
  `/admin/organization/{processes,plant-processes,users}`, `/test/layout`,
  `/`, `/profile`), checked for HTTP 200, absence of error-boundary markers,
  and presence of the expected headings/labels in the server-rendered HTML.
  This confirms every page still renders (SSR + hydration boundary, no crash)
  but does **not** confirm client-side interactivity (actual drag reorder,
  toggle clicks, dialog open/close) beyond code review. Recommend a manual
  interactive pass (or a retry once the preview tool is free) before/after
  merge, focused on: nav tree drag + visibility toggles with a non-admin
  role, operative-cells child reorder + drag, and the machine modal's
  cell-assignment cascade.
