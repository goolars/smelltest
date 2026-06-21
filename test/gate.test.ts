// smelltest — the Stop-decision policy (the shipped allow/block path), tested directly.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULTS } from "../src/config.ts";
import { decideStop } from "../src/gate.ts";
import type { Verdict } from "../src/types.ts";

const warn: Verdict = {
  rung: "warn",
  findings: [{ code: "done.no_substance", severity: "warn", message: "x" }],
  notChecked: [],
  codes: ["done.no_substance"],
  verifiedCheckmark: false,
};
const pass: Verdict = { rung: "pass", findings: [], notChecked: [], codes: [], verifiedCheckmark: false };

test("decideStop: a warn with no prior blocks -> block", () => {
  assert.equal(decideStop({ used: 0, recentBlocks: 0, lastBlockCodes: null }, warn, DEFAULTS), "block");
});
test("decideStop: a pass verdict -> allow_pass", () => {
  assert.equal(decideStop({ used: 0, recentBlocks: 0, lastBlockCodes: null }, pass, DEFAULTS), "allow_pass");
});
test("decideStop: at the per-session cap -> allow_cap", () => {
  assert.equal(
    decideStop({ used: DEFAULTS.bounds.maxRevisions, recentBlocks: 0, lastBlockCodes: null }, warn, DEFAULTS),
    "allow_cap",
  );
});
test("decideStop: same finding as the last block -> allow_oscillation", () => {
  assert.equal(
    decideStop({ used: 1, recentBlocks: 1, lastBlockCodes: ["done.no_substance"] }, warn, DEFAULTS),
    "allow_oscillation",
  );
});
test("decideStop: session-independent ceiling -> allow_ceiling", () => {
  assert.equal(
    decideStop(
      { used: 0, recentBlocks: DEFAULTS.bounds.absoluteIterationCeiling, lastBlockCodes: null },
      warn,
      DEFAULTS,
    ),
    "allow_ceiling",
  );
});

test("decideStop: looping the real policy caps the loop (no runaway)", () => {
  let used = 0;
  let blocks = 0;
  let lastCodes: string[] | null = null;
  for (let turn = 0; turn < 20; turn++) {
    // A DIFFERENT finding each turn so the oscillation guard does not short-circuit; only the
    // per-session cap / absolute ceiling can stop it.
    const v: Verdict = {
      ...warn,
      codes: [`f${turn}`],
      findings: [{ code: `f${turn}`, severity: "warn", message: "x" }],
    };
    const d = decideStop({ used, recentBlocks: blocks, lastBlockCodes: lastCodes }, v, DEFAULTS);
    if (d !== "block") break;
    used++;
    blocks++;
    lastCodes = v.codes;
  }
  assert.ok(
    blocks <= DEFAULTS.bounds.maxRevisions,
    `blocks (${blocks}) cannot exceed maxRevisions (${DEFAULTS.bounds.maxRevisions}) — the loop is bounded`,
  );
});
