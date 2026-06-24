---
description: Regenerate living documentation (ERD, data dictionary, migrations log) from the live EBI schema.
---

Synchronize the database documentation with the **live schema**.

Use the `docs-sync` sub-agent (read-only `ebi-sql-dev` MCP) to:

1. Introspect the current `EBI_dev` schema.
2. Regenerate `docs/database/erd.md` (Mermaid `erDiagram`).
3. Regenerate `docs/database/data-dictionary.md`.
4. Append the latest applied migration to `docs/database/migrations-log.md`.
5. Refresh any schema-derived sections in `docs/modules/*` that have drifted.

Do **not** document fallback/legacy logic unless strictly necessary. Only reflect what the
live schema reports; do not invent columns or relationships.
