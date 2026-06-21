# smelltest

**A model-free, zero-dependency Claude Code Stop gate that bounds its own retries — and
re-grades "done / tests pass" against the structure of the git diff.** No LLM, no network,
runs on every Stop. Advisory by default; bounded enforcement is one command away.

> Built research-first and rebuilt under adversarial review. The detection was upgraded from
> a lexeme scan to a structural diff check; see [`research/RESEARCH.md`](research/RESEARCH.md)
> and the honest numbers below.

## The headline: a self-owned runaway-loop fuse

The feature that makes this worth installing is the one no completion-checker ships: a
**self-owned, session-independent bound on its own retries.** When enforcement is armed and
the gate blocks to force a revision, it blocks **at most `maxRevisions` times** (default 2),
then allows the stop — enforced by an append-only ledger with three independent brakes
(per-session cap → session-independent ceiling → oscillation guard) and a verbatim
*executing* halt-proof test. It exists because uncapped agent loops burn real money; this one
**cannot run away**, proven by execution, not assertion.

## The check: claims vs. the structure of the diff

You cannot trust a model to grade itself — its confidence is the broken thing. So the gate
re-grades the agent's completion claim against **machine facts from the actual `git diff`**,
not a lexeme scan and not an LLM judge:

| Finding | What fires it | Severity |
|---|---|---|
| `done.no_substance` | "implemented/fixed" claimed, but the diff added **0 substantive lines** (non-blank, non-comment, non-import, non-stub — computed from the unified diff) | ⚠ warn |
| `tests.tampered` | "tests pass" claimed while the diff **weakened the suite** (dropped assertions, added `.skip`/`xit`/`@pytest.mark.skip`) — even when a source file also changed | ⚠ warn |
| `scope.blind_edit` | edited a file never read this session | note (advisory) |

It **never certifies "verified"** — a self-graded claim can only fail to find a problem. v1
tops out at `warn`; arming turns a warn into a *bounded* block.

### Measured (internal regression floor, not an external benchmark)

`node eval/run.ts` on a 35-case adversarial corpus (incl. real per-framework test-tamper idioms
and false-positive baits): **precision 100% · recall 100% · 0 false positives**, with a published
**false-negative floor of 2** documented evasions (a neutral completion with no claim verb; a
function signature whose body is a stub). These measure *the
author's imagination of attacks*, not real-world evasion — they are a regression floor, not a
catch-rate proof. The honest ceiling: model-free structure confirms the diff *changed in a way
consistent with the claim*; it cannot confirm the code *does* what was claimed. A determined
agent can pad inert-but-real lines past the line classifier. That is why `done.no_substance`
is **warn, never a hard block**, until a false-positive rate is published for a stricter mode.

## Install

**As a Claude Code plugin (primary):**

```
/plugin marketplace add <owner>/smelltest
/plugin install smelltest@smelltest-marketplace
```

Then `/smell` (advisory — changes nothing), `/smell-loop on` (arm bounded enforcement),
`/smell-loop off`. Requires Node ≥ 22.6 (the hooks run the `.ts` directly); `npm run build`
produces a Node-18 `dist/` bundle.

**From source (contributors / zero-marketplace):**

```bash
git clone <repo> && cd smelltest
node --test            # 18 suites incl. the executing halt-proof + diff-parser edge cases
node eval/run.ts       # precision / recall / FN floor over the adversarial corpus
node install.mjs --project /your/app   # wire the hooks into a project's .claude/
```

## Safety model

- **Advisory by default.** Nothing blocks until you `arm`. The structural findings stay warns.
- **Self-owned bound.** The ledger caps retries; we rely on **no** platform backstop or
  `stop_hook_active` signal — whether or not one exists, our bound is independent and
  load-bearing. A session-independent ceiling backs it up.
- **Fail-open.** Any internal error degrades to *allow*. A broken gate never deadlocks a turn.
- **100% offline, zero runtime deps.** No LLM, no network — auditable in one sitting.

## What changed in v0.2 (the rework)

This is a near-total rewrite, driven by an adversarial board review of the original v0.1:
- **Detection is now structural, not lexeme theater.** Blocks key off substantive-line counts
  and test-tamper signals parsed from the unified diff — catching "changed a comment and said
  done" and "weakened one assertion while editing one impl line", which v0.1 missed.
- **TypeScript, types, lint, CI** (Node 24 × ubuntu/windows) — the rigor the thesis demands.
- **Cut the sprawl:** deleted the Agent-SDK autonomous harness (it called the model at
  runtime — wrong for an always-on gate), spun out the destructive-command guard (a separate
  security niche), and dropped the citation/network tier (now fully offline).
- **Honest framing:** v0.1 was *weak-but-honest* (its README already disclosed the holes); v0.2
  makes the detector structurally stronger so the honesty can claim more. No "owns the cell",
  no star-count comparisons, no head-to-head wins on unbuilt features.

## Honest limitations

- **It raises the floor, not the ceiling.** A neutral honest-sounding completion with no claim
  verb ("the handler now returns 200") evades the scan — a documented FN in the eval.
- **`done.no_substance` is a heuristic.** A few real-looking but inert lines clear it; that's
  why it warns, never hard-blocks, in v1.
- **Coverage is Stop-bound.** It gates the final claim of a turn, from the transcript + git.
- **Unsupported languages record a gap, not a pass.** The line classifier covers common
  languages; an unknown extension under a completion claim is a `notChecked`, never silent.
- **It's a guardrail, not a sandbox.** A determined agent can disarm it.

## Layout

```
src/           types · config · ledger(fuse) · claims · substance · reconcile · kernel · evidence · stdin · cli
hooks/         stop-gate.ts · note-blind-edit.ts · hooks.json
eval/          run.ts + corpus/cases.json (adversarial)      test/  smell.test.ts
.github/ci.yml  tsconfig.json  biome.json  SMOKE-TEST.md  research/
```

## Credits & license

Built by studying excellent prior art (tdd-guard, swarm-orchestrator, danger-js, husky,
ast-grep, Guardrails AI, and others) — every borrow is idea-only and credited in
[CREDITS.md](CREDITS.md), under the policy in [LICENSING.md](LICENSING.md). smelltest copies no
third-party code and stays clean MIT.

MIT © 2026 Lars Godoy
