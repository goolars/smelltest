// smelltest — Layer 1: typed claim extraction.
// Segments the message, guards a curated abbreviation/decimal list (Intl.Segmenter alone
// still mis-splits "e.g." and "v1.2." — verified), then finds completion claims clause by
// clause so negation only cancels a claim in the SAME clause. This is a marginally-better
// lexeme scan, NOT robustness: a neutral honest completion ("the handler now returns 200")
// evades it by design. The residual evasion rate is measured by eval/run.ts.

import type { Config } from "./config.ts";
import type { Claim, ClaimKind } from "./types.ts";

const ABBREV =
  /\b(?:e\.g|i\.e|etc|vs|cf|al|fig|no|vol|eq|approx|dr|mr|mrs|ms|st|jr|sr|inc|ltd|co|u\.s|a\.m|p\.m)\.$/i;

function endsWithAbbrevOrDecimal(s: string): boolean {
  const t = s.trimEnd();
  if (ABBREV.test(t)) return true;
  if (/\d\.$/.test(t)) return true; // "v1.2." — digit immediately before the final dot
  if (/(^|\s)[a-z]\.$/i.test(t)) return true; // single-letter abbreviation "v."
  return false;
}

export function segmentSentences(text: string): string[] {
  if (!text) return [];
  let base: string[];
  try {
    const seg = new Intl.Segmenter("en", { granularity: "sentence" });
    base = Array.from(seg.segment(text), (s) => (s as { segment: string }).segment);
  } catch {
    base = text.split(/(?<=[.!?\n;])\s+/);
  }
  const out: string[] = [];
  let buf = "";
  for (const piece of base) {
    buf += piece;
    if (endsWithAbbrevOrDecimal(buf)) continue; // merge across a false boundary
    out.push(buf);
    buf = "";
  }
  if (buf.trim()) out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
}

function splitClauses(sentence: string): string[] {
  return sentence
    .split(/;|,\s+(?:but|and|so|then|though|although|however|yet)\b|\s+(?:but|however|yet)\s+/i)
    .map((c) => c.trim())
    .filter(Boolean);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasNegator(clause: string, negators: string[]): boolean {
  const lo = ` ${clause.toLowerCase().replace(/n't\b/g, " n't")} `;
  if (lo.includes(" n't ")) return true;
  return negators.some((n) => lo.includes(` ${n.toLowerCase()} `));
}

function findLexeme(
  clause: string,
  lexicon: Record<string, string[]>,
): { kind: ClaimKind; lexeme: string; idx: number } | null {
  const lo = clause.toLowerCase();
  let best: { kind: ClaimKind; lexeme: string; idx: number } | null = null;
  for (const kind of Object.keys(lexicon)) {
    for (const phrase of lexicon[kind]) {
      const re = new RegExp(`(^|[^a-z0-9])${escapeRe(phrase.toLowerCase())}($|[^a-z0-9])`);
      const m = re.exec(lo);
      if (m && (best === null || m.index < best.idx))
        best = { kind: kind as ClaimKind, lexeme: phrase, idx: m.index };
    }
  }
  return best;
}

export function extractClaims(text: string, cfg: Config): Claim[] {
  const claims: Claim[] = [];
  for (const sentence of segmentSentences(text)) {
    for (const clause of splitClauses(sentence)) {
      const hit = findLexeme(clause, cfg.claimLexicon);
      if (!hit) continue;
      claims.push({
        kind: hit.kind,
        lexeme: hit.lexeme,
        negated: hasNegator(clause, cfg.negators),
        sentence,
      });
    }
  }
  return claims;
}

export function activeClaims(claims: Claim[]): Claim[] {
  return claims.filter((c) => !c.negated);
}
