// smelltest — the Stop-decision POLICY, as a pure function. Extracted from the hook so the
// allow/block path consumers depend on is unit-testable (and the loop bound is proven on the
// real policy, not a re-implementation). The hook supplies ledger facts + the verdict; this
// decides; the hook performs the I/O (append + emit). Order is safety-first: caps before block.

import type { Config } from "./config.ts";
import type { Verdict } from "./types.ts";

export type StopDecision = "block" | "allow_cap" | "allow_ceiling" | "allow_oscillation" | "allow_pass";

export interface LedgerState {
  used: number; // per-session block count (the primary revision cap)
  recentBlocks: number; // session-independent recent block count (the absolute ceiling)
  lastBlockCodes: string[] | null; // codes of the most recent block, for the oscillation guard
}

function sameCodes(a: string[], b: string[]): boolean {
  const x = [...a].sort().join("|");
  const y = [...b].sort().join("|");
  return x !== "" && x === y;
}

export function decideStop(state: LedgerState, verdict: Verdict, cfg: Config): StopDecision {
  if (state.used >= cfg.bounds.maxRevisions) return "allow_cap";
  if (state.recentBlocks >= (cfg.bounds.absoluteIterationCeiling ?? 4)) return "allow_ceiling";
  if (verdict.rung !== "warn") return "allow_pass";
  if (cfg.bounds.oscillationGuard && state.lastBlockCodes && sameCodes(state.lastBlockCodes, verdict.codes)) {
    return "allow_oscillation";
  }
  return "block";
}
