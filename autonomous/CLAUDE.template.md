# Autonomous run rules (copy to your project root as CLAUDE.md)

These rules are re-injected on every request and survive compaction — which the kickoff
prompt does NOT. Put anything the agent must never forget here, not in the task prompt.

## Mission
<one paragraph: the goal and what "done" means>

## Hard constraints (binding)
- Make REAL changes. Never claim "done", "implemented", "fixed", or "tests pass" unless the
  diff and the verifier back it up. A false completion claim is the worst failure.
- Never edit tests, fixtures, or assertions to make checks pass. Fix the actual code.
- Stay in scope: only touch what the task requires. Note any unavoidable extra change.
- Do not run irreversible commands (rm -rf, git reset --hard, etc.). They are blocked anyway.
- If a requirement is ambiguous and no human is available, state your assumption explicitly
  and proceed; do not silently guess.

## Compact instructions
When summarizing this conversation, ALWAYS preserve: the mission, the hard constraints above,
the current task, and any decisions/assumptions already made. Drop verbose tool output first.

## Definition of done
- <concrete, checkable> AND the configured verifier (tests/build) passes AND the smelltest
  honesty gate does not block.
