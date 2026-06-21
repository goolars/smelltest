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

---

*This file is maintained as a hard requirement, not a courtesy: see [LICENSING.md](LICENSING.md).
A deeper source-level study (reading each codebase) is in progress and will refine the
"what we learned" notes and surface any additional, license-cleared borrows.*
