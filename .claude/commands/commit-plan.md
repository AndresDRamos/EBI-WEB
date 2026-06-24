---
description: Produce a sequence of atomic commits for the current working changes.
---

Plan **atomic commits** for the current changes (this command plans; OpenCode usually
executes the commits as the builder).

1. Review the working changes (`git status`, `git diff`).
2. Group them into atomic, self-consistent commits (one logical change each): migrations
   separate from app code, config separate from features, docs separate from logic.
3. Propose the ordered commit sequence with a clear message per commit (imperative mood).
4. Do not bundle unrelated changes. Do not commit secrets or `.env`.

End commit messages with:

```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

Only commit/push when the user asks. If on the default branch, branch first.
