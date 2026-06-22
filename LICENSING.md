# Licensing policy — how smelltest incorporates ideas from other projects

smelltest is **MIT** (see [LICENSE](LICENSE)) and stays clean MIT. We learn from other
open-source projects. We do so without contaminating that license. These are the rules every
contribution follows, and the standard the [CREDITS.md](CREDITS.md) attributions are held to.

## The rules

1. **Ideas, patterns, and algorithms → re-implement in our own code.** Concepts (e.g. "grade a
   completion claim against the diff", "express checks as warn/fail over a changeset", "ship a
   per-language reporter table") are not copyrightable expression. We re-write them from scratch
   in our own style and **credit the source in CREDITS.md regardless of its license**.

2. **Copied code → permissive licenses only, with notice.** Verbatim or lightly-adapted source
   may only be taken from **MIT / Apache-2.0 / BSD-2/3 / ISC** projects, and only with:
   - the original copyright line + license text preserved (in `third_party/<project>/LICENSE`
     and a pointer in CREDITS.md), and
   - for **Apache-2.0**, any upstream `NOTICE` content preserved in our `NOTICE` file.
   As of this writing smelltest copies **no** third-party code — every borrow is idea-only.

3. **Never copy code from copyleft licenses.** No verbatim or adapted code from **GPL / AGPL /
   LGPL / MPL / SSPL** ever enters smelltest. We may read such projects to understand an idea
   and re-implement the *concept* cleanly, but we are conservative and credit the inspiration
   without lifting expression. (This is why, e.g., semgrep — LGPL/commercial — is studied for
   pattern-rule ideas only, never code.)

4. **Zero runtime dependencies stays.** We do not bundle third-party runtime code. Dev-only
   tooling (TypeScript, esbuild, biome) is declared in `devDependencies` and is not shipped.

5. **Every project we studied is credited.** CREDITS.md lists each external project with its
   repo, license, and exactly what we learned or borrowed (idea vs. code). Studying a project
   and taking nothing still earns a credit if it shaped a decision.

## Recording a borrow (template for CREDITS.md)

```
### <Project> — <repo URL>
- License: <SPDX id> (<permissive | weak-copyleft | strong-copyleft>)
- Borrow type: idea-only | code
- What we took: <the concept or, if code, the exact files + the preserved notice location>
- Where it lives in smelltest: <path>
```

## When in doubt

Downgrade to idea-only and re-implement, or drop it. A clean MIT repo is worth more than any
single borrowed feature.
