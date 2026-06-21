---
description: Arm or disarm smelltest enforcement (bounded auto-block on Stop)
argument-hint: [on|off]
---

Toggle enforcement based on "$ARGUMENTS".

- If `on` or empty: run `node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" arm`, then state the bound
  plainly: when a completion claim is not backed by the diff, the Stop gate blocks at most
  **maxRevisions** (default 2) bounded revisions, then allows the stop. Fail-open on any error.
  Audit trail: `.smelltest/ledger.jsonl`.
- If `off`: run `node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" disarm` and confirm advisory-only.

Opt-in by design: until armed, smelltest never blocks — it only annotates via `/smell`. The
ledger fuse (per-session cap + session-independent ceiling + oscillation guard) means it can
never become the runaway loop it exists to catch.
