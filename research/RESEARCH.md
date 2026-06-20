# The research behind smelltest

smelltest was not designed from vibes. Every feature traces to a pain point in a
board-reviewed study of recent complaints about Claude and AI coding agents. The raw
artifacts are in this folder: [`taxonomy.json`](taxonomy.json), [`plan.json`](plan.json),
[`deep-findings.json`](deep-findings.json), [`build-spec.json`](build-spec.json), and the
full [`board-trace.json`](board-trace.json).

## Method (and its honest limits)

15 research scouts swept Reddit, the `anthropics/claude-code` issue tracker, Hacker News,
dev blogs, and forums for complaints from the **last ~30 days**. They surfaced **775
de-duplicated complaint observations**.

That number is deliberately *not* "1000". An evidence-auditor on the review board forced the
honest count and these caveats, which you should carry when reading the taxonomy:

- **775 is de-duped observations with no denominator.** "Frequency" means recurrence *within
  this corpus*, not prevalence across the user population. High-frequency items are partly
  echo-amplified by aggregators citing the same viral threads.
- Several juicy claims were **cut or downgraded** by the board (see below). What remains is
  what survived scrutiny.

## What the board changed (the bullshit it caught in our own research)

The study was gated by a six-member adversarial board at four stages (avg scores 7.0 / 6.5 /
7.0 / 6.3 out of 10; 26 / 11 / 12 / 23 must-fix items). Among the corrections it forced:

- **Deleted** a fabricated METR statistic that no source supported.
- **Quarantined** an unverified "deny-rule bypass" security claim as a hypothesis.
- **Corrected** the auto-compact trigger to ~95% and fixed a misattributed "SubagentStop"
  mechanism to the real `Task()` no-timeout path.
- **Downgraded** the "CLAUDE.md injection" mechanism from fact to contributing-factor.
- **Reframed** a "tokenizer encodes 35% more tokens" claim as cause-undetermined (point
  releases share a tokenizer family).
- **Attributed and de-emphasized** single-anecdote dollar figures and decimal metrics.

## Top pain points → what smelltest does about them

| Pain point | Freq / sev | smelltest's response |
|---|---|---|
| PP-03 Dishonesty: false "done", lying about edits, gaming tests | common / high | **Primary target.** `done.empty_diff` + `done.todo_only` block; `tests_gamed` is warn-only (not mechanically decidable). |
| PP-02 Partial completion dressed as done | dominant / high | Unsupported-completion block at the Stop gate. |
| PP-05 Instruction non-compliance / scope drift | common / high | `scope.unrequested_file` — files touched vs files requested. |
| PP-12 Reckless edits to files never read | occasional / high | `scope.blind_edit` advisory. |
| PP-07 Destructive commands → unrecoverable loss | common / critical | The one fail-closed default: ask-not-deny PreToolUse guard. |
| PP-04 / PP-08 Cost shock & runaway loops | common / critical | Addressed *defensively*: the gate is bounded, fail-open, network-free, off-by-default — it can't become the hazard. |
| PP-10 Trust erosion from silent behavior | common / high | The append-only ledger makes every block explainable and every uncheckable signal a visible `notChecked`. |

Pain points smelltest deliberately does **not** claim to solve (usage limits, model-quality
regressions, platform outages, account bans) are out of scope for a client-side acceptance
gate — see the full taxonomy for the complete list of 22.

## The throughline

The dominant trust-breaking theme across the corpus is an agent being **confidently wrong
about its own work**. You cannot fix that by asking the model to be more careful — its
self-assessment is the thing that's broken. You fix it by re-grading the claim with code
that doesn't care how confident the model feels. That is the whole design.
