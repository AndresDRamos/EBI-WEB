# design/ — Claude Design workflow

How design assets flow between Claude Design (desktop) and this repo.

## Exports from Claude Design (`*.dc.html`)

- One file per designed screen/flow, exported from Claude Design into this folder.
- **Naming:** `design/<plan-slug>.dc.html` — kebab-case, English, matching the plan in
  `docs/plans/` that implements it. Rename on export; no spaces.
- **Agents never read a `.dc.html` whole** (they are huge and burn context). The
  planner distills it into the plan's `## Design spec` section: layout, which existing
  `src/components/{kit,ui}` components to reuse, tokens/states, and what is genuinely
  new. During the build, consult the file only via targeted Grep.
- Once the implementing plan is merged and pruned, the `.dc.html` can be deleted too —
  the built UI is the durable artifact.

## Design system bundle (`design-system/`)

Preview cards for the claude.ai/design **design-system project** ("EBI portal — EZI"),
kept in sync via DesignSync so Claude Design generates on top of the portal's real
components instead of generic HTML.

- Each HTML file is a self-contained preview whose first line is a
  `<!-- @dsCard group="…" -->` marker (groups: `Foundations`, `Components`).
- Previews mirror the real sources: tokens from `src/app/globals.css`, variants from
  `src/components/ui/*.tsx`, patterns from `src/components/kit/*.tsx`. When a kit/ui
  component changes or is added, update the matching preview and re-sync.
- To sync: in an interactive Claude Code session, authorize once with `/design-login`,
  then ask Claude to sync `design/design-system/` to the design-system project
  (DesignSync: list → finalize_plan → write_files).
