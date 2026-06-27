---
description: Reconstruct the real documentation traversal of this session from the telemetry trace and check it against the routing table.
---

Build the **measured** doc-access map for the current session from the telemetry hook
(`.claude/hooks/trace-doc-access.mjs`), and use it to keep `docs/doc-routing.md` honest.

1. Find this session's trace at `.claude/traces/<session_id>.tsv`. If none exists, the hook
   has not fired yet (no `Read/Grep/Glob` since it was enabled) — say so and stop.
2. Read the trace. Each line is `timestamp · phase · tool · target · is_md`; `SubagentStop`
   rows mark phase boundaries between the main agent and sub-agent work.
3. **Real traversal:** summarize what was actually opened — list the `.md` docs read (with
   counts), segmented by phase, in order. This is the ground-truth recorrido, not inferred.
4. **Routing violations vs `docs/doc-routing.md`** (the objective signal):
   - a doc listed under *Skip* for this module type that **was** read → the row is wrong.
   - a doc under *Read always* that was **not** read → it is noise on the list, or was missed.
5. **Refine `docs/doc-routing.md`** with what the trace proves: move opened-but-noisy docs to
   *Skip*, drop never-read entries from *Read always*. Only act on what the trace shows; the
   "decisive vs merely opened" judgment still needs care — flag candidates, do not overclaim.
6. Optionally emit a markmap of the measured traversal (same shape as the study artifact) so
   it can be compared visually against the hand-drawn one.

Telemetry records what was **opened**, not what was **useful**. Treat violations as facts and
everything else as evidence to weigh, not proof.
