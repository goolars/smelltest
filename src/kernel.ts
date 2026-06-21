// smelltest — the kernel. A pure function: smell(evidence, config) -> verdict.
// Structural-first: blocks/warns key off facts from the diff, never a lexeme by itself.
// Never emits a "verified" check — a self-graded claim cannot earn one. v1 tops out at
// 'warn'; whether a warn becomes a real Stop-block is decided by the (opt-in) armed gate.

import { extractClaims } from "./claims.ts";
import type { Config } from "./config.ts";
import { reconcile } from "./reconcile.ts";
import type { Evidence, Verdict } from "./types.ts";

export function smell(ev: Evidence, cfg: Config): Verdict {
  const claims = extractClaims(ev?.finalMessage || "", cfg);
  const { findings, notChecked } = reconcile(claims, ev, cfg);
  const warn = findings.some((f) => f.severity === "warn");
  return {
    rung: warn ? "warn" : "pass",
    findings,
    notChecked,
    codes: findings.map((f) => f.code),
    verifiedCheckmark: false,
  };
}

export function renderVerdict(v: Verdict): string {
  const icon = (s: string) => (s === "block" ? "BLOCK" : s === "warn" ? "WARN " : "note ");
  const lines: string[] = [];
  lines.push(
    `smelltest: ${v.rung.toUpperCase()}  (never certifies "verified" — it can only fail to find a problem)`,
  );
  if (!v.findings.length) lines.push("  - nothing flagged by the structural checks.");
  for (const f of v.findings) lines.push(`  [${icon(f.severity)}] ${f.code}: ${f.message}`);
  for (const n of v.notChecked) lines.push(`  [?]    ${n.code}: ${n.reason} (gap recorded, not a pass)`);
  return lines.join("\n");
}
