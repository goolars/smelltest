# smelltest-autonomous

A **bounded autonomous Claude agent** on the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk),
gated by smelltest's honesty checks **and** an objective verifier, with hard walls the agent
can't touch. It runs a task to completion without surveillance — *within a budget you set*.

> ⚠️ **This calls the Claude API at runtime and spends money on every run.** It was built but
> **not run here** — running it is itself the "always-on Claude" pattern, and there's no key in
> this environment. *You* deploy it, deliberately, in an isolated container, with the cap. This
> is the one sanctioned, bounded form of the thing you were right to be wary of.

## The loop (why it's safe)

```
clarify (ask if a human is present, else proceed on stated assumptions)
  └─► query() runs to completion ──► collect final text + tool uses + cost
        └─► Gate 1 OBJECTIVE VERIFIER (tests/build) ── correctness, the REAL "done"
        └─► Gate 2 smelltest kernel ── honesty (no false "done", no blind edit, …)
              ├─ both pass ──────────────► DONE
              ├─ no verifier configured ─► escalate for human review (never auto-accept)
              └─ fail ─ within caps ─────► reiterate with concrete, machine-derived feedback
```

The reiterate loop is **owned in host code**, not in an SDK Stop hook — the SDK's
"Stop hook forces continuation" behaviour is undocumented, so we don't depend on it. We run
`query()`, grade the result deterministically, and re-run with precise feedback if needed.

## The walls (none live where the agent can edit them)

| Wall | Mechanism | Default |
|---|---|---|
| Money | `maxBudgetUsd` (SDK hard stop → `error_max_budget_usd`) | **$2 / run** |
| Turns | `maxTurns` (SDK hard stop → `error_max_turns`) | 40 |
| Reiterations | app-owned cap | 3 |
| Wall-clock | external `setTimeout` → `process.exit` (host, agent can't reach) | 10 min |
| Destructive cmds | in-process `PreToolUse` **deny** (host process) | on |
| Permissions | `dontAsk` + scoped `allowedTools` (headless-safe hard-deny) | on |

Tuned for **efficiency**: Sonnet + `medium` effort, `dontAsk` (no permission round-trips),
a scoped tool set, the cheap deterministic gate (not a model critic), and durable rules in
CLAUDE.md so they survive compaction instead of being re-sent every turn.

## Honest limits — read before trusting it

- **smelltest gates honesty, not correctness.** Without `SMELLTEST_VERIFY_CMD` there is **no
  truth gate** — the harness refuses to auto-accept and escalates for human review instead.
  For real autonomy, give it a real verifier (`npm test`, `pytest`, `tsc --noEmit`, a build).
- **The honesty gate is gameable** by an agent optimizing to pass it. The objective verifier is
  the real gate; smelltest is the lie-detector on top.
- **VERIFY-ON-DEPLOY (SDK surface I could not run here):** option names (`maxBudgetUsd`,
  `permissionMode`, `settingSources`, `resume`, …) and the `PreToolUse` deny shape are
  doc-confirmed; the `ResultMessage` field casing is ambiguous in the docs, so the harness
  reads **both** `total_cost_usd`/`totalCostUsd`, `session_id`/`sessionId`, `stop_reason`/
  `stopReason`. Still unconfirmed: whether `maxBudgetUsd` counts *subagent* spend, and the
  `resume`-by-sessionId behaviour across revisions. Confirm on first run; the external
  wall-clock kill is the backstop if a cap doesn't bind as expected.
- `selftest.mjs` proves the **glue** (guards, verifier, evidence, kernel wiring), **not** the
  live loop.

## Use

```bash
cd autonomous && npm install
export ANTHROPIC_API_KEY=...            # required at run time
export SMELLTEST_VERIFY_CMD="npm test"  # STRONGLY recommended — the correctness gate
export SMELLTEST_MAX_USD=2              # your blast radius
node agent.mjs "implement <X> and make the tests pass"
node selftest.mjs                       # verify the glue (no key/spend needed)
```

Isolated container (the recommended posture):

```bash
docker build -t smelltest-autonomous -f autonomous/Dockerfile .
docker run --rm -e ANTHROPIC_API_KEY -e SMELLTEST_VERIFY_CMD="npm test" \
  -v "$PWD/project:/work/project" smelltest-autonomous "implement X in /work/project"
```

Put mission + hard constraints in the project's **CLAUDE.md** (see `CLAUDE.template.md`) — the
kickoff prompt is lost to compaction; CLAUDE.md is not.

## Config (env)

`SMELLTEST_MODEL` · `SMELLTEST_EFFORT` · `SMELLTEST_PERMISSION_MODE` · `SMELLTEST_ALLOWED_TOOLS`
· `SMELLTEST_MAX_USD` · `SMELLTEST_MAX_TURNS` · `SMELLTEST_MAX_REVISIONS` · `SMELLTEST_DEADLINE_MS`
· `SMELLTEST_VERIFY_CMD` · `SMELLTEST_ATTENDED` (1/0; default auto-detect TTY).
