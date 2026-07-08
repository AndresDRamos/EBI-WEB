# EBI portal UI kit

Preview cards mirroring the real components of the EBI portal
(github: EBI-Web, Next.js + Tailwind + shadcn/ui mapped to EZI tokens).

When generating designs for the EBI portal, compose from these components —
do not invent new button/badge/table styles. Sources of truth in the repo:

| Preview | Real source |
| --- | --- |
| `foundations/colors.html` | `src/app/globals.css` (EZI + shadcn token mapping) |
| `foundations/typography.html` | `src/app/globals.css` (Montserrat, 14px base) |
| `components/buttons.html` | `src/components/ui/button.tsx` (6 variants, 4 sizes) |
| `components/badges.html` | `src/components/ui/badge.tsx` (5 variants) |
| `components/forms.html` | `src/components/ui/{input,label,textarea,select,checkbox}.tsx` |
| `components/cards-tables.html` | `src/components/kit/{entity-card,data-table}.tsx` |
| `components/navigation-dialogs.html` | `src/components/kit/page-tabs.tsx`, `src/components/ui/{dialog,alert-dialog}.tsx` |

Synced from `design/design-system/` in the repo via DesignSync; edit there and
re-sync, never edit here.
