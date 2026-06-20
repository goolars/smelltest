---
description: Re-grade the last turn's done/verified/cited claims with model-free checks (advisory, changes nothing)
---

Run the smelltest kernel over the most recent turn and report the verdict.

1. Run: `node "${CLAUDE_PLUGIN_ROOT}/bin/smell-cli.mjs" --latest --json`
   (If `${CLAUDE_PLUGIN_ROOT}` is not set in this surface, use the path where smelltest is
   installed, e.g. `node ~/.claude/plugins/smelltest/bin/smell-cli.mjs --latest --json`.)
2. Show me the rendered verdict verbatim — every BLOCK/WARN finding and every `notChecked`
   gap. Do not soften or summarize away a finding.
3. Add one honest line: does the verdict change your confidence in the last turn, or not?

This is advisory — it reads the transcript and git, runs the deterministic checks, and
prints. It does not block, edit, or "fix" anything. The evidence comes from the transcript
and git, never from your own recollection of what you did.
