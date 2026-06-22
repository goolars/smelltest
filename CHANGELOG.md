# Changelog

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
  `npx github:<owner>/smelltest` works, a `files` allowlist shipping what `init` needs, and
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
