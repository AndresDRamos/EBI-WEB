---
description: Promote an approved plan into docs/plans with the next sequential NNNN number and Approved status.
argument-hint: [slug]
---

Promote the most recent approved plan into the repository under `docs/plans/`.

1. Find the next sequential number `NNNN` by inspecting existing `docs/plans/NNNN-*.md`
   files (zero-padded to 4 digits).
2. Create `docs/plans/NNNN-$1.md` from the approved plan content, following the section
   layout of `docs/plans/_template.md`.
3. Set the **Status** field to `Approved` with today's date.
4. Add a one-line entry to `docs/plans/README.md` (the index): `NNNN — title — one-line hook`.

Do not alter already-published plans; only add the new one. Keep secrets out of the file.
