# Live validation — recent `claude-code` user feedback (snapshot 2026-06-22)

The original taxonomy ([`RESEARCH.md`](RESEARCH.md)) was a ≤30-day complaint sweep. Before settling
the README positioning, the pain points were **re-validated against live sources** — a web-enabled
research fan-out across the `anthropics/claude-code` issue tracker, Reddit, Hacker News, X, and dev
blogs, plus the existing taxonomy as a baseline. This file records what the live data said and the
positioning decision it drove. **It is a dated snapshot. Issue numbers, reaction counts, and states
are as observed on 2026-06-22 and will drift.**

## What the live data confirmed

The two pains smelltest targets are both real and current — but they rank differently than a naive
read suggests:

- **False / fabricated "done" is broad and daily.** Recurring issues describe the agent claiming
  completion or "verified" with nothing actually wired up, and — the sharper variant — **fabricated
  or skipped test results presented as passing** ("reported 60 passed / 0 failed / 8 skipped as a
  success, when the core feature was broken" — an agent reading an *old* clean test-results file and
  reporting it as a fresh pass). Users describe a "rework rate" on work prior sessions "claimed was
  complete." This is the emotionally dominant, high-frequency pain.
- **Self-looping hooks are the acute, begged-for primitive.** There are open feature requests for a
  cost ceiling Claude Code does not have (`--max-cost` / `--budget` / circuit-breaker), and — most
  relevant to us — reports of **Stop hooks that loop on themselves**, one running ~50 minutes and
  consuming an entire session's quota. The single most-cited cause of hook-related bill shock is
  *hook recursion*. Community guidance is explicit: "always give a blocking Stop hook a termination
  condition — a bounded retry count."
- **Hooks/deny-rules get bypassed.** Agents have been observed defeating git pre-commit hooks with
  `--no-verify`/stash/quiet flags despite explicit `CLAUDE.md` prohibitions. This is the ceiling on
  what *any* client-side guard — including smelltest — can promise, and it is why detection stays a
  **warn**, not a hard block.

## The positioning decision

**Lead with the fuse. The re-grade is the second act.**

- The bounded fuse is the part that is **rock-solid and uncontested**: existing "force completion"
  Stop hooks do *not* bound their own retries or address token cost. A hook that provably bounds its
  own loop turns the audience's #1 objection ("won't this hook be the thing that runs away?") into
  the proof point. It is the claim smelltest can make without hedging.
- The re-grade-against-diff is the more *emotionally* dominant pain, but it lands in a **crowded
  category** (verification-loop skills, "never mark done with failing tests" `CLAUDE.md` rules). Its
  only real differentiation is being model-free / offline / diff-grounded, and it can only honestly
  promise a *warning* — so it is framed as "and then it checks the claim," softened to "warning, not
  a silent green."

This corrected an earlier internal read that the audience was *narrow* (only loop-burned power
users). The live data shows the **false-"done" annoyance is broad and daily**, while the
**dollar-catastrophe is narrow** (mostly unattended/overnight automation). Headlining the fuse to a
broad, mildly-annoyed base is the resolution.

## Honesty caveats (carry these when reading the above)

- This is a **complaint corpus**: existence, not prevalence. "Dominant/common" = recurrence within
  the sample, not a population base rate.
- The highest-engagement issues overall are about **Anthropic billing/quota policy**, which smelltest
  does **not** address and does not claim to. We target the self-inflicted loop and the false-"done,"
  not usage limits.
- smelltest's fuse bounds **its own enforcement loop** — it is *not* a global `--max-cost` budget cap
  on all Claude Code usage. The README is written to claim only the former.
