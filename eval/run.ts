// smelltest — eval runner. Scores the kernel against the adversarial corpus and prints
// PRECISION + RECALL + the false-negative floor. Framed as an INTERNAL regression floor
// measured against a self-authored corpus, NOT an external benchmark or a "catch-rate proof".
// Run: node eval/run.ts   (CI runs it; the README quotes the number it prints.)

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { smell } from '../src/kernel.ts';
import { DEFAULTS } from '../src/config.ts';
import type { Evidence } from '../src/types.ts';

interface Case { name: string; tag: string; evidence: Evidence; note?: string; }
const here = path.dirname(url.fileURLToPath(import.meta.url));
const corpus = JSON.parse(fs.readFileSync(path.join(here, 'corpus', 'cases.json'), 'utf8')) as { cases: Case[] };

let tp = 0, fp = 0, fn = 0, tn = 0;
const evasions: string[] = [];
const fpNames: string[] = [];
const fnNames: string[] = [];

for (const c of corpus.cases) {
  const warned = smell(c.evidence, DEFAULTS).rung === 'warn';
  if (c.tag === 'positive') { if (warned) tp++; else { fn++; fnNames.push(c.name); } }
  else if (c.tag === 'negative') { if (warned) { fp++; fpNames.push(c.name); } else tn++; }
  else if (c.tag === 'evasion') { if (!warned) evasions.push(c.name); else tp++; }
  // notchecked / advisory excluded from precision/recall
}

const precision = tp + fp ? tp / (tp + fp) : 1;
const recall = tp + fn ? tp / (tp + fn) : 1;
const fnFloor = fn + evasions.length;

console.log('smelltest eval — internal regression floor (self-authored adversarial corpus)');
console.log(`  cases:        ${corpus.cases.length}`);
console.log(`  precision:    ${(precision * 100).toFixed(1)}%  (TP ${tp} / FP ${fp})  ${fpNames.length ? '-> ' + fpNames.join(', ') : ''}`);
console.log(`  recall:       ${(recall * 100).toFixed(1)}%  (TP ${tp} / FN ${fn})  ${fnNames.length ? '-> ' + fnNames.join(', ') : ''}`);
console.log(`  FN floor:     ${fnFloor}  (${fn} missed + ${evasions.length} documented evasions: ${evasions.join(', ') || 'none'})`);
console.log('  note:         measures the author\'s imagination of attacks, not external evasion. Not a credibility-proof catch-rate.');

// Non-zero exit only on a regression: a false POSITIVE (blocking honest work) is the worst
// failure for keep-rate, so the gate fails CI on any FP.
if (fp > 0) { console.error(`\nFAIL: ${fp} false positive(s) — honest work would be flagged.`); process.exit(1); }
