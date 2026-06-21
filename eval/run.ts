// smelltest — eval runner. Scores the kernel against the adversarial corpus and prints
// PRECISION + RECALL + the false-negative floor. Framed as an INTERNAL regression floor
// measured against a self-authored corpus, NOT an external benchmark or a "catch-rate proof".
// CI-enforced BOTH ways: any false positive fails, AND any rise in the FN floor fails (a recall
// regression — the gate going blind to a real signal — breaks CI the same as a false positive).
// Run: node eval/run.ts

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { DEFAULTS } from "../src/config.ts";
import { smell } from "../src/kernel.ts";
import type { Evidence } from "../src/types.ts";

interface Case {
  name: string;
  tag: string;
  evidence: Evidence;
  note?: string;
}
const here = path.dirname(url.fileURLToPath(import.meta.url));
const corpus = JSON.parse(fs.readFileSync(path.join(here, "corpus", "cases.json"), "utf8")) as {
  cases: Case[];
};

let tp = 0;
let fp = 0;
let fn = 0;
let tn = 0;
const evasions: string[] = [];
const fpNames: string[] = [];
const fnNames: string[] = [];

for (const c of corpus.cases) {
  const warned = smell(c.evidence, DEFAULTS).rung === "warn";
  if (c.tag === "positive") {
    if (warned) tp++;
    else {
      fn++;
      fnNames.push(c.name);
    }
  } else if (c.tag === "negative") {
    if (warned) {
      fp++;
      fpNames.push(c.name);
    } else tn++;
  } else if (c.tag === "evasion") {
    if (!warned) evasions.push(c.name);
    else tp++;
  }
  // notchecked / advisory excluded from precision/recall
}

const precision = tp + fp ? tp / (tp + fp) : 1;
const recall = tp + fn ? tp / (tp + fn) : 1;
const fnFloor = fn + evasions.length;
// The headline number, CI-enforced. Raise ONLY by adding a documented evasion + a CHANGELOG note.
const EXPECTED_FN_FLOOR = 2;

console.log("smelltest eval — internal regression floor (self-authored adversarial corpus)");
console.log(`  cases:        ${corpus.cases.length}`);
console.log(
  `  precision:    ${(precision * 100).toFixed(1)}%  (TP ${tp} / FP ${fp})  ${fpNames.length ? `-> ${fpNames.join(", ")}` : ""}`,
);
console.log(
  `  recall:       ${(recall * 100).toFixed(1)}%  (TP ${tp} / FN ${fn})  ${fnNames.length ? `-> ${fnNames.join(", ")}` : ""}`,
);
console.log(
  `  FN floor:     ${fnFloor} / ${EXPECTED_FN_FLOOR}  (${fn} missed + ${evasions.length} documented evasions: ${evasions.join(", ") || "none"})`,
);
console.log(
  "  note:         measures the author's imagination of attacks, not external evasion. Not a credibility-proof catch-rate.",
);

let failed = false;
if (fp > 0) {
  console.error(`\nFAIL: ${fp} false positive(s) — honest work would be flagged.`);
  failed = true;
}
if (fnFloor > EXPECTED_FN_FLOOR) {
  console.error(
    `\nFAIL: FN floor ${fnFloor} > expected ${EXPECTED_FN_FLOOR} — a real tamper/false-done signal regressed (recall dropped). Raise the floor deliberately (documented evasion + CHANGELOG) if intended.`,
  );
  failed = true;
}
if (failed) process.exit(1);
