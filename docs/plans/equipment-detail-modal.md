---
id: equipment-detail-modal
status: verified
created: 2026-07-08
touches: [maintenance]
migrations: []
supersedes: null
superseded_by: null
---

# Equipment detail as an expanding modal (shared-element transition)

## Objective

Replace `maintenance/machines`' full-page navigation (tarjeta → `[code]/page.tsx`)
with a "shared element" transition: the clicked card expands in place into a
modal, and equipment attributes are edited in-place inside that same modal
instead of a separate centered `MachineFormDialog`. The same modal is reused
for creating a new equipment (animating from the "+" button), and the QR
label opens as a modal stacked on top instead of navigating to another page.
Design pattern sourced from a Claude Design prototype (card→modal FLIP,
editable summary panel, stacked QR popup); all actual attributes/business
logic come from the existing repo code, not the prototype's example data.

## Steps

1. `src/components/kit/expanding-modal.tsx` — generic FLIP shell built on raw
   `@radix-ui/react-dialog` primitives (`forceMount`, geometry driven by hand
   across `opening → open → closing` phases). `useExpandingModal()` exposes
   `requestClose`/`opened` to children.
2. `src/components/kit/entity-card.tsx` — additive `onExpand`/`sourceHidden`
   props (alternative to `href`); `machine-cards.tsx` switches to it, with a
   ref-map so the context-menu "Editar" animates from the same card rect.
3. `GET /api/maintenance/assets/[id]` extended to include `assignments`
   (`listHistoryByAsset`, previously only used server-side in the retired
   page); new `use-asset-detail.ts` hook fetches it on demand for the tabs
   only — the summary panel renders instantly from the row that opened the
   modal.
4. `use-machine-form.ts` (form state/submit extracted from the old
   `MachineFormDialogInner`, owns a `saved` snapshot updated locally after
   create/edit — no refetch) + `machine-tabs.tsx` (Procesos/Ubicación/
   Restricciones/Documentos, moved unchanged) + `machine-modal.tsx` (header,
   always-visible editable summary panel, tabs, create→edit-in-place
   transition on first save) replace `machine-form-dialog.tsx`'s dialog +
   the retired `machine-detail.tsx`.
5. Desactivar/Reactivar wired from `MachineModal`'s header into the existing
   `AlertDialog`/`restore()` in `machines-cards-page.tsx` (no duplicated
   confirmation UI); `is_active` patched locally so the header button flips
   instantly without waiting on a list refresh.
6. QR: `qr.ts` (`buildAssetQrDataUrl`, shared with the printable label page),
   `GET /api/maintenance/assets/[id]/qr`, `qr-modal.tsx` (stacked preview +
   download; "Imprimir etiqueta" still opens the proven `/label` route).
7. `[code]/page.tsx` becomes a redirect shim to `machines?asset=<code>`
   (`DeepLinkOpener` in `machines-cards-page.tsx` reads it and strips the
   query param) — keeps `cell-detail.tsx`'s link and already-printed QR
   labels resolving.
8. Delete `machine-detail.tsx`; trim `machine-form-dialog.tsx` to the shared
   types + `ParentSearchPanel`.

## Database impact

None — no `db/migrations/` changes, no schema touched.

## Amendments

- 2026-07-08 — During implementation, `ExpandingModal`'s first version used
  the "adjust state during render" pattern (to satisfy the
  `react-hooks/set-state-in-effect` lint rule) but produced a rare stuck
  state (mount flips back to unmounted) reproducible in the dev browser.
  Reverted to a plain `useEffect` with a scoped, justified lint suppression
  — a legitimate use (starting an animation timeline from a prop flip), not
  the derived-state anti-pattern the rule targets. Plan's Objective and
  approach are otherwise unchanged.
- 2026-07-08 — QR modal follow-ups after initial verification: the QR
  preview box appeared off-center — root cause was the footer buttons
  ("Descargar PNG"/"Imprimir etiqueta") overflowing the dialog's
  `sm:max-w-sm` width, skewing the whole CSS grid column; widened to
  `sm:max-w-md` and confirmed via exact on-screen measurements (dialog, box,
  and image all share the same center). Also removed the QR modal's
  subtitle line per user request. Both are cosmetic, no scope change.
- 2026-07-08 — Verified end-to-end in the dev browser: card→modal expand,
  in-place edit + save (persisted), create-new (animates from "+", transitions
  in place to view mode with tabs enabled, no refetch), QR preview + download,
  close animation, context-menu Editar/Desactivar/Reactivar (instant header
  update), deep-link `?asset=<code>` and the `[code]/page.tsx` redirect shim.
  `pnpm lint`/typecheck clean throughout.
