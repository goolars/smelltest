---
description: Re-grade the last turn's done / tests-pass claims against the diff (advisory, changes nothing)
---

Run smelltest's structural kernel over the most recent turn and report the verdict.

1. Run: `node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" --latest --json`
   (Node >= 22.6 runs the `.ts` directly. If `${CLAUDE_PLUGIN_ROOT}` is unset, use the install
   path, e.g. `node ~/.claude/plugins/smelltest/src/cli.ts --latest --json`, or the built
   `dist/cli.mjs`.)
2. Show me the rendered verdict verbatim — every WARN finding and every `notChecked` gap. Do
   not soften or summarize away a finding.
3. Add one honest line: does the verdict change your confidence in the last turn, or not?

Advisory only: it reads the transcript + git, runs the model-free structural checks, and
prints. It does not block, edit, or "fix" anything. The evidence comes from the transcript and
git, never from your own recollection of what you did.
