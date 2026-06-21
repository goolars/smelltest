# Contributing to smelltest

Thanks for looking. smelltest is small on purpose — a model-free, zero-dependency Stop gate — and
the bar for a change is that it stays that way. The fastest path to a merged PR is to keep the
gate green and respect a few hard invariants.

## The green gate is the contract

Every change must pass, locally and in CI, all four:

```bash
npx biome check .      # format + lint
npx tsc --noEmit       # types
node --test            # unit + e2e (Node ≥ 22.6 strips the TS types)
node eval/run.ts       # precision / recall / false-negative floor
```

CI runs this on Node 24 across **ubuntu and windows**, plus a Node-18 `npm run build`. If you
can't run Windows locally, that's fine — CI is the backstop; just don't hand-code paths.

## Hard invariants (a PR that breaks one will be asked to change)

1. **Zero runtime dependencies.** Nothing may be added to `dependencies` in `package.json`. Dev
   tooling is fine. An optional analyzer (e.g. an AST adapter) must be a *dynamic* import so a
   plain install stays dependency-free.
2. **Erasable types only.** The hooks run `.ts` directly via Node's type-stripping — no `enum`, no
   `namespace`, no parameter properties, no `const enum`. If `node --test` runs it, it's legal.
3. **Advisory by default, fail-open always.** The gate is inert unless armed, and any internal
   error must degrade to *allow*. A bug must never be able to deadlock a turn or hard-block by
   surprise. The `catch` in `hooks/stop-gate.ts` is load-bearing — keep it.
4. **Never certify "verified."** A self-graded claim can only fail to find a problem. No code path
   may emit a green "verified" check.
5. **Findings are honest about uncertainty.** If something can't be mechanically decided, it's a
   `notChecked` gap (visible), never a silent pass and never an over-confident warn.

## Adding or changing a detection rule

- Add corpus cases in [`eval/corpus/cases.json`](eval/corpus/cases.json): at least one `positive`
  (should fire) **and** one `negative` false-positive bait (must not fire). `node eval/run.ts`
  must keep **0 false positives** — a single FP fails CI.
- The false-negative floor (`EXPECTED_FN_FLOOR` in `eval/run.ts`) is a ratchet. Lowering it (better
  recall) is always welcome. *Raising* it is only acceptable with a documented evasion case and a
  CHANGELOG note saying why — never silently.
- New severities beyond `warn` / `advisory` (i.e. a real `block`) need a published false-positive
  rate first. That's deliberate.

## Licensing

smelltest is MIT and copies no third-party code. You may re-implement an *idea* from other work, but
credit it in [CREDITS.md](CREDITS.md) under the policy in [LICENSING.md](LICENSING.md). Never paste
code from GPL/AGPL/LGPL projects — those are idea-only references at most.

## Commits & PRs

Keep PRs focused. Describe what changed and paste the four-command gate output. New behavior needs a
test; if it's not tested, it's not done — which is, after all, the whole point of this project.
