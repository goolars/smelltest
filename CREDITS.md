# Credits & attributions

smelltest (MIT) was built and refined by studying excellent prior art. Per
[LICENSING.md](LICENSING.md), **every borrow below is idea-only** — we re-implemented concepts
in our own code and copied no third-party source. Each project is credited with its license
regardless of whether we took code.

Licenses below were verified against each project's GitHub repository (June 2026). No
third-party source code is bundled or copied into smelltest; if that ever changes, the copied
files, their permissive license, and (for Apache-2.0) any `NOTICE` will be recorded here and
under `third_party/`.

### tdd-guard — https://github.com/nizos/tdd-guard
- **License:** MIT (permissive) · **Borrow:** idea-only
- The bar for a credible Claude Code agent-discipline hook: a clean TS codebase, an extensible
  per-framework "reporter" model, and tight hook + config structure. smelltest's language-aware
  comment/stub table (`src/config.ts`) follows the same *extensible-table* spirit, re-written.

### swarm-orchestrator — https://github.com/moonrunnerkc/swarm-orchestrator
- **License:** ISC (permissive) · **Borrow:** idea-only
- A deterministic, model-free set of detection categories (empty-diff, no-op, test-tamper) —
  convergent validation that structural detection works. smelltest stays deliberately one-job
  (claim-vs-diff); our `tests.tampered` and `done.no_substance` signals are our own
  implementation of a shared idea, kept at the line level rather than file level.

### danger-js — https://github.com/danger/danger-js
- **License:** MIT · **Borrow:** idea-only
- Expressing checks as `warn()` / `fail()` / `message()` severities over a structured changeset.
  smelltest's `Finding` severity model (warn / advisory note over a parsed `git diff`) is in the
  same spirit, re-implemented for the Stop-hook context.

### husky — https://github.com/typicode/husky
- **License:** MIT · **Borrow:** idea-only
- The DX bar for a beloved git-hook tool: minimal, near-zero-config install. smelltest keeps its
  `arm` / `disarm` / `status` surface deliberately tiny.

### ast-grep — https://github.com/ast-grep/ast-grep
- **License:** MIT · **Borrow:** idea-only (**deferred to v2**)
- Tree-sitter structural matching — the technique for a future AST-based substance check (mapping
  added line ranges onto post-image AST nodes). v1 deliberately ships a pure-built-ins line
  classifier instead, to keep the zero-dependency / trivially-auditable property.

### semgrep — https://github.com/semgrep/semgrep
- **License:** LGPL-2.1 (weak copyleft) — **IDEA-ONLY, no code, ever** · **Borrow:** idea-only
- Declarative pattern-rule design as a model for a future configurable-checks layer. Because of
  the copyleft license we take **no code** — the concept only, conservatively.

### Guardrails AI — https://github.com/guardrails-ai/guardrails
- **License:** Apache-2.0 (permissive) · **Borrow:** idea-only
- The validator + on-fail-action architecture (a policy per check). smelltest encodes a
  lightweight version through discrete `Finding` severities (warn vs. advisory) rather than a
  full validator framework — kept minimal to fit the model-free / zero-dep thesis.

### NeMo Guardrails — https://github.com/NVIDIA/NeMo-Guardrails
- **License:** Apache-2.0 · **Borrow:** idea-only (**mostly not adopted**)
- A rails/flows config DSL for guardrails. We deliberately did **not** adopt it — it is
  model-using and heavier than smelltest's one-job, offline thesis. Credited for the study.

### AI-SLOP-Detector — https://github.com/flamehaven01/AI-SLOP-Detector
- **License:** MIT · **Borrow:** idea-only
- File-level stub / TODO "slop" signals — convergent with smelltest's line-level substance
  classifier (we classify added diff lines, not whole files).

## v0.3 hardening sources (idea-only, no code copied)

### parse-diff — https://github.com/sergeyt/parse-diff
- **License:** MIT © 2014 Sergey Todyshev · **Borrow:** idea-only
- The concept of deriving a file's path from the **authoritative `+++ ` line** (with `a/`/`b/`…
  prefix-strip) rather than the ambiguous `diff --git` line. Re-implemented from scratch in
  `src/evidence.ts parseUnifiedDiff` — the disambiguation regex was **not** copied.

### gitdiff-parser — https://github.com/ecomfe/gitdiff-parser
- **License:** MIT © 2020 Baidu EFE · **Borrow:** idea-only
- Header split-on-space dispatch + `isBinary` + `/dev/null` add/delete inference + rename
  framing **concepts**. Re-implemented in `src/evidence.ts` and the binary/deleted/renamed
  buckets in `src/substance.ts`.

### git diff-format docs — https://git-scm.com/docs/diff-format
- **License:** N/A (documented format, no code) · **Borrow:** idea-only
- Combined-diff (`--cc` / `@@@`) recognition, `core.quotePath` C-quoting output, and the
  rename `a/`=source `b/`=destination framing.

### pre-commit — https://github.com/pre-commit/pre-commit (incl. identify)
- **License:** MIT © pre-commit dev team / © 2017 Chris Kuehl, Anthony Sottile · **Borrow:** idea-only
- Validate-config-at-load + never-silent-zero-match (`src/config.ts validateConfig`,
  `test-selector-miss`); identify's NAMES→EXTENSIONS→shebang **layering** concept noted for a
  future hand-authored table (the ~800-entry table is **not** imported).

### lefthook — https://github.com/evilmartians/lefthook
- **License:** MIT © 2019 Arkweid · **Borrow:** idea-only
- Binary file-type concept and validate-at-load DX. (No code; Go → not portable anyway.)

### Test-framework skip/disable idioms (API facts only, no code)
The `skipMarkers` / `assertionMarkers` in `src/config.ts` are **hand-authored** from each
framework's documented idioms:
- **Go testing** — BSD-3-Clause (`Skip`/`SkipNow`/`Skipf`) · **stretchr/testify** — MIT
  (`s.T().Skip` routes through the embedded `*testing.T`) · **eslint-plugin-jest** — MIT © 2018
  Jonathan Kim (canonical JS skip/focus idiom enumeration) · **pytest** — MIT
  (`@pytest.mark.skip/skipif/xfail`) · **Python unittest** — PSF docs · **RSpec** — MIT
  (`x`/`f` variants) · **Rust Reference** — MIT/Apache-2.0 (`#[ignore]` optional reason) ·
  **JUnit 5** — **EPL-2.0 (weak copyleft): PRINCIPLE / API-FACT ONLY** — the `@Disabled`/`@Ignore`
  *names* are documented API facts; **no JUnit source was read or copied.**

## v0.4 spend-governor sources (idea-only, no code copied)

### LiteLLM — https://github.com/BerriAI/litellm
- **License:** MIT © BerriAI · **Borrow:** idea-only (schema shape + per-token price fields)
- `pricing/litellm-snapshot.json` follows the **shape** of LiteLLM's
  `model_prices_and_context_window.json` (per-token input/output/cache fields). The figures are
  Anthropic's own public list prices, hand-entered and dated; **no LiteLLM JSON or code was
  copied** — the file is our own, attributed here. A new model that isn't matched resolves to a
  `notChecked` gap, never a silent $0.

### ccusage — https://github.com/ryoppippi/ccusage
- **License:** MIT © ryoppippi · **Borrow:** idea-only (cost-from-tokens algorithm)
- The approach of computing cost locally from the transcript `usage` token classes (since
  Claude Code stopped emitting a cost field), including **de-duplicating by `message.id +
  requestId`** and the **1h cache-write × 2** subtlety. Re-implemented from scratch in
  `src/cost.ts` (verified against a real `~/.claude` transcript); no ccusage source was read or
  copied. ccusage is a *reporter*; smelltest's differentiator is **enforcing** the cap in-loop.

All idea-only. smelltest copies no third-party code and stays clean MIT.

---

*This file is a hard requirement, not a courtesy: see [LICENSING.md](LICENSING.md).*
