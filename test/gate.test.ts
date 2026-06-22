// smelltest — the Stop-decision policy (the shipped allow/block path), tested directly.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULTS } from "../src/config.ts";
import { type LedgerState, decideStop } from "../src/gate.ts";
import type { Verdict } from "../src/types.ts";

const warn: Verdict = {
  rung: "warn",
  findings: [{ code: "done.no_substance", severity: "warn", message: "x" }],
  notChecked: [],
  codes: ["done.no_substance"],
  verifiedCheckmark: false,
};
const pass: Verdict = { rung: "pass", findings: [], notChecked: [], codes: [], verifiedCheckmark: false };

// state factory — spendUsd defaults to null (governor inactive) unless a test sets it.
const st = (p: Partial<LedgerState> = {}): LedgerState => ({
  used: 0,
  recentBlocks: 0,
  lastBlockCodes: null,
  spendUsd: null,
  ...p,
});

test("decideStop: a warn with no prior blocks -> block", () => {
  assert.equal(decideStop(st(), warn, DEFAULTS), "block");
});
test("decideStop: a pass verdict -> allow_pass", () => {
  assert.equal(decideStop(st(), pass, DEFAULTS), "allow_pass");
});
test("decideStop: at the per-session cap -> allow_cap", () => {
  assert.equal(decideStop(st({ used: DEFAULTS.bounds.maxRevisions }), warn, DEFAULTS), "allow_cap");
});
test("decideStop: same finding as the last block -> allow_oscillation", () => {
  assert.equal(
    decideStop(st({ used: 1, recentBlocks: 1, lastBlockCodes: ["done.no_substance"] }), warn, DEFAULTS),
    "allow_oscillation",
  );
});
test("decideStop: session-independent ceiling -> allow_ceiling", () => {
  assert.equal(
    decideStop(st({ recentBlocks: DEFAULTS.bounds.absoluteIterationCeiling }), warn, DEFAULTS),
    "allow_ceiling",
  );
});

test("decideStop: spend over the ceiling -> allow_budget, checked FIRST (even over a would-be block)", () => {
  // A warn would normally block; but cumulative spend >= ceiling means STOP NOW, not nag-and-spend.
  assert.equal(decideStop(st({ spendUsd: DEFAULTS.budget.ceilingUsd }), warn, DEFAULTS), "allow_budget");
  assert.equal(decideStop(st({ spendUsd: DEFAULTS.budget.ceilingUsd + 5 }), pass, DEFAULTS), "allow_budget");
});
test("decideStop: spend under the ceiling -> normal flow (block)", () => {
  assert.equal(decideStop(st({ spendUsd: DEFAULTS.budget.ceilingUsd - 0.01 }), warn, DEFAULTS), "block");
});
test("decideStop: the $ brake is opt-out (disabled or ceiling 0) without touching the loop fuse", () => {
  const disabled = { ...DEFAULTS, budget: { enabled: false, ceilingUsd: 10 } };
  assert.equal(decideStop(st({ spendUsd: 999 }), warn, disabled), "block");
  const zero = { ...DEFAULTS, budget: { enabled: true, ceilingUsd: 0 } };
  assert.equal(decideStop(st({ spendUsd: 999 }), warn, zero), "block");
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
    const d = decideStop(st({ used, recentBlocks: blocks, lastBlockCodes: lastCodes }), v, DEFAULTS);
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
