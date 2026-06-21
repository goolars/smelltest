# Security Policy

## Reporting a vulnerability

Please report security issues **privately** via GitHub's **Security → Advisories → Report a
vulnerability** on the repository (i.e. `https://github.com/<owner>/smelltest/security/advisories/new`
once published) — not a public issue. I'll acknowledge within a few days. There is no bounty; this
is a solo open-source project.

## Threat model (what smelltest is and isn't)

smelltest is a **local, offline** Claude Code Stop hook. Being honest about its boundaries is part
of the project's whole thesis:

- **No network, no LLM, zero runtime dependencies.** It reads your session transcript and the local
  `git diff`, runs pure functions, and exits. It sends nothing anywhere. The dependency-free design
  means the supply-chain surface is the Node runtime and this repo's own code — auditable in one
  sitting.
- **It is a guardrail, not a sandbox.** When armed, it can *bound* an agent's retries and flag
  unsupported completion claims — but an agent (or user) with write access to the repo can disarm
  it (delete `.smelltest/armed`) or silence findings via `.smelltest/config.json`. This is
  disclosed in the README; do not deploy smelltest as a security control against a hostile agent.
- **Fail-open is intentional.** Any internal error degrades to *allow* so a bug can never deadlock a
  turn. This is a deliberate availability-over-enforcement trade-off, not an oversight.
- **The ledger is integrity-relevant.** `.smelltest/ledger.jsonl` is the append-only record the
  retry bound relies on. It is not currently tamper-evident (a hash-chain is a recorded future
  item). Treat it as advisory audit data, not a cryptographic guarantee.

## What counts as a vulnerability here

- A crafted transcript or diff that makes the hook **crash without failing open** (i.e. produces a
  hang or an un-caught hard block).
- A path that causes the gate to **block when it should allow** in a way the bound can't release.
- Any way the hook **reads or writes outside the project / its `.smelltest/` dir**, or executes
  attacker-controlled input.

A determined agent evading *detection* (padding inert lines, neutral phrasing) is a known,
documented limitation in the eval — not a vulnerability.
