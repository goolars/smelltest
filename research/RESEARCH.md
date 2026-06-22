# The research behind smelltest

smelltest was not designed from vibes. Every feature traces to a pain point in a
board-reviewed study of recent complaints about Claude and AI coding agents. The raw
artifacts are in this folder: [`taxonomy.json`](taxonomy.json), [`plan.json`](plan.json),
[`deep-findings.json`](deep-findings.json), [`build-spec.json`](build-spec.json), and the
full [`board-trace.json`](board-trace.json).

> **These JSON files are the historical build record**, captured before the structural rework.
> They still name early-draft finding codes (`done.empty_diff`, `done.todo_only`, `tests_gamed`,
> `scope.unrequested_file`) that were since consolidated or cut. The table below — and the shipped
> code — is the authority on what actually exists. The artifacts are kept unedited for provenance,
> not as a spec.

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
7.0 / 6.3 out of 10, 26 / 11 / 12 / 23 must-fix items). Among the corrections it forced:

- **Deleted** a fabricated METR statistic that no source supported.
- **Quarantined** an unverified "deny-rule bypass" security claim as a hypothesis.
- **Corrected** the auto-compact trigger to ~95% and fixed a misattributed "SubagentStop"
  mechanism to the real `Task()` no-timeout path.
- **Downgraded** the "CLAUDE.md injection" mechanism from fact to contributing-factor.
- **Reframed** a "tokenizer encodes 35% more tokens" claim as cause-undetermined (point
  releases share a tokenizer family).
- **Attributed and de-emphasized** single-anecdote dollar figures and decimal metrics.

## Top pain points → what smelltest does about them

This table lists the **codes that actually ship in v0.3** — no others. (An earlier draft of this
file named codes — `done.empty_diff`, `done.todo_only`, `tests_gamed`, `scope.unrequested_file` —
that the structural rework consolidated or cut — they were corrected here rather than left to imply
features that don't exist.)

| Pain point | Freq / sev | smelltest's response (shipped) |
|---|---|---|
| PP-04 / PP-08 Cost shock & runaway loops | common / critical | **The headline feature:** a self-owned, bounded retry fuse (ledger cap → ceiling → oscillation guard). Bounded, fail-open, network-free, off-by-default — it can't become the hazard. |
| PP-03 Dishonesty: false "done", gaming tests | common / high | `done.no_substance` (claim vs. 0 substantive added lines) and `tests.tampered` (claim vs. dropped assertions / added skips) — both graded from the diff, both **warn**. |
| PP-02 Partial completion dressed as done | dominant / high | Same `done.no_substance` re-grade at the Stop gate — the claim is checked against the diff, not taken on the model's word. |
| PP-12 Reckless edits to files never read | occasional / high | `scope.blind_edit` advisory (note severity). |
| PP-10 Trust erosion from silent behavior | common / high | The append-only ledger makes every block explainable, and every uncheckable signal a visible `notChecked` — silenced findings included, never silent. |

**Scoped out of v0.3 (named honestly so this file can't mislead):** the *destructive-command
PreToolUse guard* (PP-07) was spun out as a separate security niche, and the *requested-vs-touched
scope check* (PP-05) was not built — neither ships here. Pain points smelltest never claims to solve
(usage limits, model-quality regressions, outages, account bans) are out of scope for a client-side
acceptance gate. See the full taxonomy for all 22.

## The throughline

The dominant trust-breaking theme across the corpus is an agent being **confidently wrong
about its own work**. You cannot fix that by asking the model to be more careful — its
self-assessment is the thing that's broken. You fix it by re-grading the claim with code
that doesn't care how confident the model feels. That is the whole design.
