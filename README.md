# smelltest

**A bounded, adversarial acceptance gate for Claude Code.** It re-grades the agent's own
"done / verified / fixed / cited" claims with **model-free code** before you accept the
turn — catching false completion, scope drift, blind edits, and naked confidence. Advisory
by default; enforcement is one command away. Engineered so the bullshit-detector can never
become the runaway loop it was built to catch.

> Built research-first: a board-reviewed study of **775 recent (≤30-day) complaints** about
> Claude / agents drove every feature. See [`research/RESEARCH.md`](research/RESEARCH.md).

## Why

The single most corrosive failure people report isn't the model being wrong — it's the
model being **confidently wrong about its own work**: "Implementation complete!" over a
TODO-only body, "tests pass" after editing the tests, edits to files it never opened, a
citation that doesn't say what was claimed. (Pain points PP-02/03/05/12 in the study.)

The core idea: **you cannot trust a model to grade itself — its verbalized confidence is
systematically overconfident.** So smelltest's blocking verdict is *never* the model's
say-so. It is a deterministic function over machine-checkable signals:

| Signal | What it catches | Verdict |
|---|---|---|
| completion claim + **empty diff** | "done" but nothing changed | ⛔ block |
| completion claim + **TODO-only body** | "implemented" but it's a stub | ⛔ block |
| files **touched ∉ files requested** | scope drift | ⚠ warn |
| files **edited ∉ files read** | blind edit | ⚠ warn |
| strong confidence + **no change, no citation** | naked confidence | ⚠ warn |
| "tests pass" + **only test files changed** | gaming the tests | ⚠ warn |
| destructive command (rm -rf, reset --hard…) | irreversible data loss | ❓ ask |

It never emits a "verified" checkmark — a verdict produced with no human in the loop can
only *fail to find a problem*, it cannot certify. Two rungs only: WARN and BLOCK. A verdict
full of `warn`/`?` reads as rigor, not weakness.

## How it works

- **The kernel** (`bin/smell.mjs`) — a pure, zero-dependency function over an evidence
  object. The fast tier is model-free *and* network-free; it is the only logic allowed to
  block.
- **The gate** (`hooks/stop-gate.mjs`) — a deterministic `command`-type Stop/SubagentStop
  hook; the blocker is model-free by design. It reads the evidence from the **transcript +
  git**, never from the model's recollection, and blocks the stop to force *one bounded
  revision* when a claim fails.
- **The perimeter** — a PreToolUse guard that **asks** (never silently allows, never hard-
  denies) before irreversible deletes, and a non-blocking PostToolUse note for blind edits.
- **The advisory tier** — `/smell` re-grades your last turn any time, changing nothing.
- **The critic** (`agents/smell-critic.md`) — an optional read-only subagent that tries to
  *refute* your claims; it can only accuse, never accept or edit.
- **The skill** (`skills/self-critique/SKILL.md`) — has the model run the kernel on itself
  before it says "done".

## Quick start

```bash
git clone <this repo> && cd smelltest
node --test                              # prove it works (corpus + bound tests, all green)
node install.mjs --project /path/to/app  # wire into a project's .claude/
```

Then, inside Claude Code in that project:

```
/smell              # re-grade the last turn (advisory — changes nothing)
/smell-loop on      # arm enforcement: blocks at most 2 bounded revisions, fail-open
/smell-loop off     # disarm
```

Active by default: only the destructive-command guard (it asks before irreversible deletes).
Everything else is advisory until you arm it.

## Safety model (read this)

Agent loops that never decide they're done are how people burn hundreds of dollars. smelltest
is built so that **can't happen by accident**:

- **Off by default.** Blocking is opt-in via `/smell-loop on`. Default experience is advisory.
- **Self-owned bound.** The gate reads its append-only ledger and allows the stop once it has
  blocked `maxRevisions` times (default 2). We don't rely on any platform-side cap or a
  `stop_hook_active` signal — whether or not the runtime has one, this ledger is an
  independent, self-owned bound, and it's load-bearing.
- **Independent brakes.** An oscillation guard (same failure twice → stop) and a
  *session-independent* absolute block ceiling back it up, so the bound holds even if
  `session_id` semantics ever change.
- **Fail-open.** Any internal error — unreadable ledger, missing git, parse failure — degrades
  to *allow*. A broken gate never deadlocks a turn.
- **Ask, never deny.** The one fail-closed default (irreversible deletes) returns `ask`, so
  you decide. It never silent-allows and never hard-denies.
- **No API of its own.** It rides your existing session; it calls nothing.

## Dogfooding — corrections this tool's own discipline caught

This repo eats its own dog food, and it shows:

- **The blocker is deterministic by design.** The original spec wanted a model "critic" to be
  the Stop hook itself. We rejected that: the thing that blocks you must not be a model, since
  a model's confidence in its own work is exactly what this tool distrusts. The gate ships as
  a deterministic `command` hook; the model critic ships as an opt-in subagent + skill.
- **Its own test suite caught three real bugs before commit:** the verdict legend literally
  contained a `✓` glyph while claiming it never emits one; the CLI subcommands fell through
  when a flag preceded them; and smelltest's own `.smelltest/` state polluted the git diff it
  was inspecting.
- **A three-critic board audit of the finished code caught more, pre-commit:** an honest
  "I haven't fixed it yet" was being *blocked* (a negation-blind matcher); `tests_gamed` was
  documented but not actually implemented; and a confidently-wrong "Stop hooks can't spawn
  subagents" claim had crept into the docs. All corrected before the first commit — the loop
  catching itself, which is the whole point.

## Honest limitations

- **It raises the floor, not the ceiling.** The completion check is lexeme-based: it catches
  the naive "done"/"verified" lie against an empty or TODO body. A model that paraphrases
  ("the implementation is now in place") or stays silent can evade it. (Honest negations like
  "not done yet" are deliberately *not* flagged.) It makes the *cheap* lie expensive; it does
  not make lying impossible.
- **The empty-diff block is defeated by any unrelated change.** It fires only when the tree is
  truly empty; an incidental write (a scratch file, a log) downgrades it to a scope warning.
  It verifies that *something* changed, not that the *right* thing did.
- **`done.todo_only` is all-or-nothing.** It blocks only when *every* changed file body is a
  stub; a real helper beside a stubbed main function passes. Deliberately conservative — a
  false block on honest work is worse than a miss.
- **Coverage is Stop-bound.** It gates the final claim of a turn. Mid-stream text you read
  before the turn ends, MCP-tool writes, and tool paths it doesn't match are out of scope.
- **Extraction is best-effort.** It depends on the transcript format and on git being present;
  where it can't determine a signal it records an explicit `notChecked` entry — never a silent
  pass.
- **`tests_gamed` is not mechanically decidable**, so it is warn-only, never a block.
- **The ledger is integrity-by-convention.** It's append-only JSONL; a process that deletes
  `.smelltest/ledger.jsonl` resets the per-session count (still re-bounded by the cap, the
  ceiling, and the oscillation guard). It's an honesty aid, not a tamper-proof control.
- **The destructive guard is a convenience asker, not a wall.** It asks before common
  irreversible commands but won't catch every form (obscure flags, novel tools). It only ever
  *asks*, so a miss degrades to the normal permission flow, never to danger.
- **The citation tier is advisory and off by default**; it resolves URLs and flags single-
  domain echo. It does **not** check entailment (whether the source supports the claim).
- **It is a guardrail, not a sandbox.** A determined agent can disarm it. It is for honesty
  and ergonomics, not security.

## Layout

```
.claude-plugin/plugin.json   commands/   agents/   skills/   hooks/
bin/   smell.mjs  smell-cli.mjs  extract-evidence.mjs  lib/{checks,ledger,config}.mjs
eval/corpus/cases.json        test/smell.test.mjs       config.json   install.mjs
research/  taxonomy.json  plan.json  deep-findings.json  build-spec.json  board-trace.json
```

## License

MIT © 2026 Lars Godoy
