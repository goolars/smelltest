---
description: Arm or disarm smelltest enforcement (auto-block on Stop) for this project
argument-hint: [on|off]
---

Toggle smelltest enforcement based on "$ARGUMENTS".

- If "$ARGUMENTS" is `on` or empty: run
  `node "${CLAUDE_PLUGIN_ROOT}/bin/smell-cli.mjs" arm`
  then tell me enforcement is ON and state the bound plainly: the Stop gate will block at
  most **maxRevisions** times (default 2) when a completion claim fails the deterministic
  checks, then it allows the stop. It fails open on any error. Audit trail: `.smelltest/ledger.jsonl`.
- If "$ARGUMENTS" is `off`: run
  `node "${CLAUDE_PLUGIN_ROOT}/bin/smell-cli.mjs" disarm`
  and confirm enforcement is OFF (advisory only).

Be explicit that this is the opt-in step: until armed, smelltest never blocks — it only
annotates via `/smell`. Arming spends a little extra per turn (one fast `node` run on Stop)
and can cost at most a couple of bounded revisions. That is the whole safety story: it can
never become the runaway loop it was built to catch.
