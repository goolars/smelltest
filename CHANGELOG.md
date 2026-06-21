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
- **Corpus**: 20 → 35 cases incl. real-framework positives and false-positive baits. eval still
  reports **100% precision · 100% recall · 0 false positives**.
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
- **Tests**: 9 → 29 (parser edge-case, transcript-schema, config-validation, `decideStop`
  policy, and a live-hook child-process e2e that drives the shipped Stop gate end-to-end).

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
