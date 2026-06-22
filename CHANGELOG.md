# Changelog

## v0.4.0 — the spend / runaway governor (research + board specced)

A web research fan-out + a 4-member board (staff eng / DevRel / OSS maintainer / skeptic)
converged **unanimously** on this: the most-screamed-for, model-free-buildable, uncontested gap is
an **in-loop spend cap**. Native `--max-budget-usd` bounds a *single* `claude -p`; the pain that
burned users `$313 in 8.5h` and `$6k overnight` is the *multi-invocation* daemon loop — and no Stop
hook receives a cost field. smelltest now closes it.

**Added — the spend governor**
- **Deterministic cost engine** (`src/cost.ts`): walks the session transcript, **de-dupes assistant
  turns by `(message.id + requestId)`** (verified: ~58% of rows are duplicates — naive summing
  ~triples the figure), multiplies the token classes by a **pinned, dated price snapshot**
  (`pricing/litellm-snapshot.json`), and sums. Flat `usage.*` primary, `usage.iterations[]`
  fallback; **1h cache writes price at input × 2.** Pure, offline, no clock.
- **A new `allow_budget` brake** (`src/gate.ts`): when armed and cumulative session spend crosses
  `budget.ceilingUsd`, the Stop gate **allows the stop with a loud receipt** — checked *first*, and
  an *allow* (it only shortens a session), so it rides the existing executing halt-proof and **can
  never itself become the runaway.** One armed flag, one ledger, one bounded decision.
- **`smelltest spend [--latest|--transcript <p>] [--json] [--ci]`** — the same engine as a CLI: a
  dry-run receipt in 60 seconds, and `--ci` exits 1 over the ceiling for headless `claude -p`
  watchdogs (the #57719 multi-invocation case).
- **Fail-soft, never silent.** An unknown/new model id → `notChecked` (surfaced as a lower bound),
  **never** a false "$0 / within budget." Verified on a real transcript: every current model priced
  via longest-prefix family match, `<synthetic>` and unknown → notChecked.
- **Honest by construction.** Every figure is labelled an **estimate** (client-side token × price,
  drifts from the real bill; a token-equivalent budget on Pro/Max; bounds the *next* turn). Stated
  in the receipt and the README.
- **Zero-config:** a sane default ceiling ships in `DEFAULTS`; per-repo override via
  `.smelltest/config.json → budget.ceilingUsd`. Install is still the one command `npx smelltest init`.
- **Tests (+9, now 39):** exact-cost fixture (dedup + 1h-cache×2 + fail-soft), the `allow_budget`
  branch, and an e2e driving the real hook to an `allow_budget` receipt. Sources attributed
  idea-only in CREDITS (LiteLLM, ccusage — both MIT).

**Review-board fixes (an adversarial board ran on the v0.4 build and found real defects)**
- **Corrected the price snapshot** — it had shipped legacy Claude-3-era figures: Opus 4.x was **3×
  too high** ($15/$75 → the correct **$5/$25** per 1M) and Haiku 4.5 too low ($0.80/$4 → **$1/$5**),
  while the file claimed they were current. Verified against Anthropic's published list; added Fable
  5 / Mythos 5 ($10/$50). Re-derived the exact fixture (0.117255 → 0.047255).
- **Pinned the prices independently of the fixture.** The exact-cost fixture is computed *from* the
  snapshot, so it could never catch a wrong price; a new test asserts each family's per-1M price as a
  hard literal, so a future drift fails CI.
- **Fixed a real runaway: a typo'd `bounds` value looped forever.** `validateConfig` clamped `budget`
  but not `bounds` — a non-numeric `maxRevisions` made `used >= NaN` always false, so the gate would
  block every turn (the exact unbounded loop the fuse exists to prevent). Now coerced like `budget`.
- **Restored fail-open on an unwritable ledger.** A persistent ledger-write failure left `used` at 0
  → block forever; `ledger.append` now reports failure and the block branch fails *open*.
- **De-overclaimed the headline.** The README sold the budget brake with active-halt verbs
  ("hard-stops a runaway agent"); the mechanism is an *allow* at the turn boundary, not a mid-flight
  interrupt. Reworded to say exactly that, and split the in-loop single-session bound from the
  multi-invocation `spend --ci` case (the in-loop hook can't see the cross-invocation `$313/$6k`
  daemon loop).

**Ship-gate fixes (a final board ran the gate itself and blocked the push)**
- **The gate was actually red.** `biome check .` failed on `src/cli.ts` (`noVoidTypeReturn`) — and a
  prior commit had *claimed* "gate green" without re-running it (a buggy `| tail -1` check masked the
  error). Fixed the lint; now gated on the real exit code, not a piped tail.
- **Killed the `hard-stops your agent` overclaim where it actually shipped** — it was still in
  `package.json` / `plugin.json` / `marketplace.json` (the npm + plugin install surfaces); the README
  fix hadn't reached them. All three now match the honest README wording.
- **Cost engine undercount fixed.** The `iterations[]` fallback gated on the *total* flat tokens, so a
  stray 1h-write marker on a parent row stopped it from firing — a live row counted 990,975 cache-read
  tokens as 355. Now gates on the *substantive* classes and keeps the parent 1h marker; two tests pin
  the split-row case and prove no double-count. A false *low* is forbidden by the project's own rule.
- Tests 39 → 43. CI badge added (repo is now live at `goolars/smelltest`).

## v0.3.0 — hardening (research-driven, license-clean)

Driven by a deep source read of high-star comparables (tdd-guard, pre-commit, lefthook,
reviewdog, parse-diff, gitdiff-parser, eslint-plugin-jest, and the framework docs) — see
[CREDITS.md](CREDITS.md). Every borrow is idea-only; smelltest stays MIT with zero runtime deps.

**Added / fixed**
- **Diff-parser rewrite** (`src/evidence.ts`): two-mode state machine; file path from the
  authoritative `+++` / `rename to` line — fixes mis-attribution on spaced and literal-`b/`
  paths; C-quoted unicode path decoding; rename / new / deleted (`/dev/null`) / binary /
  mode-only / combined (`--cc`) handling; NUL-byte sniff on untracked binaries.
- **Test-tamper hardening** (`src/config.ts`, `src/substance.ts`): per-framework skip/disable
  idioms (jest/vitest/mocha, pytest/unittest, Go + testify, Rust, JUnit 5, RSpec) with anchored
  regexes; whole-test-file deletion and test-renamed-out-of-path as first-class signals;
  narrowed the `should` assertion marker (was a false-positive source).
- **Robustness**: config regex validation at load (a malformed override reverts to default
  instead of crashing the gate); explicit `notChecked` gaps for binary/merge-only changes and
  test-selector misses.
- **Corpus**: 20 → 35 cases incl. real-framework positives and false-positive baits. eval reports
  **100% precision · 88% recall (2-evasion FN floor) · 0 false positives** (see the honest-recall
  fix below — recall counts the documented evasions as misses).
- **Pure Stop-decision policy** (`src/gate.ts`): the allow/block decision is extracted from the
  hook into a pure `decideStop(ledgerState, verdict, cfg)`, so the consumer-facing path is
  unit-tested and the loop bound is proven on the real policy (not a re-implementation).
- **Per-repo false-positive escape hatch**: a project's `.smelltest/config.json` now actually
  loads (two-layer merge: defaults → plugin → project), and `disabledCodes` silences a finding
  in your repo — routed to `notChecked` so it stays auditable, never silently dropped.
- **CI-enforced recall floor** (`eval/run.ts`): an `EXPECTED_FN_FLOOR` snapshot fails CI if the
  false-negative floor rises (a real signal regressing), the same way a false positive does.
- **Distribution**: `.claude-plugin/marketplace.json`; README install reframed (marketplace
  primary, source as the contributor path); pain-first README + faithful terminal demo SVG.
- **Tests**: 9 → 30 (parser edge-case, transcript-schema, config-validation, `decideStop`
  policy, and live-hook child-process e2e tests that drive the shipped Stop gate end-to-end —
  including the `maxRevisions` cap proven through the real hook).

**Closure-board fixes (a re-assessment board turned smelltest's own thesis on itself)**
- **Honest recall.** `eval/run.ts` previously reported recall only over the catchable set, pinning
  it at 100% by construction. It now counts the documented evasions as the misses they are
  (recall ≈ 88%), so the number can actually drop — no unfalsifiable headline.
- **Install can't silently no-op.** `install.mjs --dist` (and auto-detect on Node < 22.6) wires the
  built `dist/hooks/*.mjs` and *refuses* to install `.ts` hooks a Node can't run — a silently-inert
  guardrail was the exact "looks done, isn't" failure the project condemns.
- **`npm run demo`.** One command spins up a throwaway repo + false-completion transcript and drives
  the real hook `block → block → allow (cap)`, so the headline fuse is observable, not just asserted.
- **CLI honors per-repo config.** `smelltest --latest/--stdin` now loads `.smelltest/config.json`
  (it only did so via the hooks before).
- Corrected README over-claims the board flagged: dropped a "single most-reported" superlative the
  taxonomy doesn't support, fixed a wrong CI path, removed the broken `OWNER`-placeholder CI badge.

**Evidence-driven repositioning (re-validated against live 2026 `claude-code` issues)**
- A web research fan-out across the live issue tracker, Reddit, HN, X and blogs (captured in
  [`research/live-2026-validation.md`](research/live-2026-validation.md)) showed the **bounded fuse**
  is the strongest, most-defensible hook — users are filing feature requests for exactly that
  primitive and report *Stop hooks that loop on themselves and eat a session's quota*. README +
  plugin description rewritten **fuse-first**: "the guardrail that can't become the runaway it's
  guarding against," with the diff re-grade demoted to the honest "and then it checks the claim
  (warn, not a silent green)." No new capability claimed — only the framing changed to match the
  evidence and the code.

**One-command install (`npx smelltest init`)**
- `init` is now a first-class CLI subcommand: `npx smelltest init` wires the Stop/PostToolUse hooks
  into the current project's `.claude/` in one step — no clone, no `--project` needed, **idempotent**
  on re-run (it de-dupes its own hook entries instead of stacking them), advisory by default.
- Package is npx-publishable: `bin` → the built `dist/cli.mjs` (with shebang), a `prepare` build so
  `npx github:goolars/smelltest` works, a `files` allowlist shipping what `init` needs, and
  `engines` widened to **Node ≥ 18** (the dist path runs there; `.ts` direct still needs ≥ 22.6).
- Removed `install.mjs` — its wiring (including the `--dist` / Node-version guard) moved into
  `smelltest init`, so there's one install path, not two that can drift.
- README rebuilt **viral-first**: a one-line tagline, the demo, the single `npx smelltest init`
  command, and three scannable bullets up top; the deeper prose moved below the fold.

**Deferred to a later release (recorded honestly, not hidden)**
- Stub-bodied-declaration rule (retire the `def …: pass` FN floor) — highest FP risk; needs the
  FP-bait corpus to guard it first.
- Filename→classification NAMES map (Dockerfile / Makefile / shebang) + per-test-block tamper.
- Optional, dynamically-imported AST adapter (tree-sitter or the project's own TS) — must stay a
  dynamic import so `npm i smelltest` remains zero-runtime-dependency.
- Tamper-evident ledger hash-chain (`node:crypto`, no new dep) — defense-in-depth on smelltest's
  own retry record.

## v0.2.0 — structural rework

Replaced lexeme detection with structural diff-grading; migrated to TypeScript; cut the
Agent-SDK autonomous harness and the destructive-command guard; dropped the citation/network
tier (100% offline). Headline reframed to the runaway-loop fuse.

## v0.1.0 — initial

Bounded adversarial acceptance gate (lexeme-based prototype).
