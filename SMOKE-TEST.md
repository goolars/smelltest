# Pre-ship smoke test (HARD gate)

Every unit test runs against a synthetic `Evidence` object. The real Stop-hook stdin /
transcript contract can only be exercised inside a live Claude Code session, so the following
is a **required checklist item before any release** — not a nice-to-have.

Run from a throwaway project (`git init`, no commits):

1. **Block on a false completion.** Arm the gate, feed the Stop hook a transcript whose last
   assistant message claims completion against a clean working tree:
   ```bash
   smelltest arm
   printf '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"All done — implemented the feature."}]}}\n' > t.jsonl
   printf '{"session_id":"S","hook_event_name":"Stop","transcript_path":"<abs t.jsonl>","cwd":"<abs repo>"}' \
     | CLAUDE_PROJECT_DIR="<abs repo>" node hooks/stop-gate.ts
   ```
   Expect: `{"decision":"block","reason":"… done.no_substance …"}`.

2. **Allow after the cap.** Repeat the same Stop call until the per-session cap (or the
   oscillation guard on an identical finding) fires. Expect a `systemMessage` allowing the
   stop, and a ledger (`.smelltest/ledger.jsonl`) showing `block` → `allow_oscillation` /
   `allow_cap`. The loop must demonstrably halt.

3. **Inert when disarmed.** `smelltest disarm`, repeat step 1 — expect exit 0 with no output.

4. **Fail-open.** Feed malformed stdin (`echo 'not json' | node hooks/stop-gate.ts`) — expect
   exit 0, never a hang or a block.

Record the run (paste the block reason + the ledger tail) in the release notes. A release
without this evidence is not shippable, because green unit tests do not prove the live
transcript parser produces the evidence the kernel expects.
