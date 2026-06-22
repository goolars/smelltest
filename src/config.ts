// smelltest — canonical configuration. DEFAULTS is the single source of truth; a shipped
// config.json (if any) may only override these keys. No duplicated literal blocks.

import fs from "node:fs";
import path from "node:path";

export interface Config {
  bounds: {
    maxRevisions: number;
    absoluteIterationCeiling: number;
    oscillationGuard: boolean;
    maxMinutes: number;
  };
  // The spend governor: when armed and cumulative session cost (a client-side ESTIMATE) crosses
  // ceilingUsd, the Stop gate allows the stop with a loud receipt. A token-equivalent budget, not
  // your literal bill. Set ceilingUsd: 0 to disable the $ brake (the loop fuse stays on).
  budget: {
    enabled: boolean;
    ceilingUsd: number;
  };
  // claim kind -> phrases that signal it. A marginally-better-than-naive lexeme scan, NOT
  // robustness: a neutral completion ("the handler now returns 200") evades it by design.
  // The residual evasion rate is measured by eval/run.ts, not asserted away.
  claimLexicon: Record<string, string[]>;
  negators: string[];
  // file extension -> line-comment / block-comment prefixes used by the substance classifier.
  commentPrefixes: Record<string, string[]>;
  testFilePattern: string; // a file is a "test" file if its path matches this (regex source)
  skipMarkers: string[]; // added lines that disable a test (regex sources)
  assertionMarkers: string[]; // removed lines that drop an assertion (regex sources)
  // Finding codes the human has chosen to silence in THIS repo (the false-positive escape
  // hatch). A disabled code never warns; it is recorded as a notChecked gap, never dropped
  // silently. Set per-repo in .smelltest/config.json, e.g. {"disabledCodes":["done.no_substance"]}.
  disabledCodes: string[];
  ledgerPath: string;
  armedFlagPath: string;
}

export const DEFAULTS: Config = {
  bounds: { maxRevisions: 2, absoluteIterationCeiling: 4, oscillationGuard: true, maxMinutes: 30 },
  budget: { enabled: true, ceilingUsd: 10 },
  claimLexicon: {
    implemented: [
      "implemented",
      "added",
      "created",
      "built",
      "wrote",
      "wired up",
      "wired it up",
      "done",
      "complete",
      "completed",
      "finished",
      "shipped",
      "ready to go",
      "all set",
      "good to go",
      "should be good",
      "should do it",
      "that's done",
      "in place now",
    ],
    fixed: [
      "fixed",
      "resolved",
      "patched",
      "corrected",
      "repaired",
      "works now",
      "working now",
      "fully working",
    ],
    tested: [
      "tests pass",
      "tests are passing",
      "passing now",
      "all tests pass",
      "test suite passes",
      "tests green",
      "verified",
      "tests now pass",
    ],
    removed: ["removed", "deleted", "dropped", "cleaned out"],
    refactored: ["refactored", "cleaned up", "restructured", "reorganized"],
  },
  negators: [
    "not",
    "never",
    "cannot",
    "can't",
    "couldn't",
    "won't",
    "wasn't",
    "isn't",
    "aren't",
    "haven't",
    "hasn't",
    "hadn't",
    "didn't",
    "don't",
    "doesn't",
    "unable",
    "fail",
    "failed",
    "incomplete",
    "unfinished",
    "still need",
    "still needs",
    "not yet",
    "to do",
    "remaining",
    "yet to",
  ],
  commentPrefixes: {
    js: ["//", "/*", "*"],
    mjs: ["//", "/*", "*"],
    cjs: ["//", "/*", "*"],
    ts: ["//", "/*", "*"],
    tsx: ["//", "/*", "*"],
    jsx: ["//", "/*", "*"],
    java: ["//", "/*", "*"],
    kt: ["//", "/*", "*"],
    scala: ["//", "/*", "*"],
    c: ["//", "/*", "*"],
    h: ["//", "/*", "*"],
    cpp: ["//", "/*", "*"],
    cc: ["//", "/*", "*"],
    cs: ["//", "/*", "*"],
    go: ["//", "/*", "*"],
    rs: ["//", "/*", "*"],
    swift: ["//", "/*", "*"],
    php: ["//", "/*", "*", "#"],
    py: ["#"],
    rb: ["#"],
    sh: ["#"],
    bash: ["#"],
    yaml: ["#"],
    yml: ["#"],
    toml: ["#"],
    r: ["#"],
    sql: ["--"],
    lua: ["--"],
    css: ["/*", "*"],
    scss: ["//", "/*", "*"],
  },
  testFilePattern:
    "(^|[/\\\\])(tests?|spec|__tests__)([/\\\\])|\\.(test|spec)\\.[a-z0-9]+$|_test\\.[a-z0-9]+$",
  // Per-ecosystem skip/focus/disable idioms, each anchored to its call/decorator form to keep
  // precision (a bare word would false-positive on identifiers/comments — guarded by FP-bait
  // corpus cases). Deliberately EXCLUDES .failing, #[should_panic], and JUnit assume* (those
  // are legitimate conditions, not test-disabling). Idioms cross-checked against framework docs
  // (Go testing BSD-3, testify MIT, pytest MIT, unittest PSF, JUnit5 EPL-2.0 API-fact-only,
  // RSpec MIT, Rust reference MIT/Apache, eslint-plugin-jest MIT) — see CREDITS.md, all idea-only.
  skipMarkers: [
    // JS / TS (jest, vitest, mocha, jasmine)
    "\\.skip\\b",
    "\\.only\\b",
    "\\.todo\\b",
    "\\.skipIf\\b",
    "\\.runIf\\b",
    "\\bxit\\s*\\(",
    "\\bxtest\\s*\\(",
    "\\bxdescribe\\b",
    "\\bfdescribe\\s*\\(",
    "\\bfcontext\\s*\\(",
    "\\bfit\\s*\\(",
    "\\bthis\\.skip\\s*\\(",
    "^\\s*pending\\s*\\(",
    // Python (pytest, unittest)
    "@(?:pytest\\.mark\\.)?(?:skip|skipif|xfail)\\b",
    "\\bpytest\\.(?:skip|xfail|importorskip)\\s*\\(",
    "@(?:unittest\\.)?(?:skip|skipIf|skipUnless|expectedFailure)\\b",
    "\\.skipTest\\s*\\(",
    // Go (testing + testify; receiver-agnostic so t.Skip/t.SkipNow/t.Skipf/s.T().Skip all match)
    "\\.Skip(?:Now|f)?\\s*\\(",
    // Rust (#[ignore] with optional reason)
    "#\\[\\s*ignore",
    // JVM (JUnit5 @Disabled, JUnit4 @Ignore)
    "@Disabled\\b",
    "@Ignore\\b",
    // RSpec (xexample/xcontext/xspecify, focus f-variants)
    "\\bx(?:context|specify|example)\\b",
    "\\bf(?:it|describe|context)\\s*\\(",
  ],
  // Assertion shapes (removed -> weakened suite). 'should' is anchored to the Chai/RSpec call
  // forms ('.should', 'should_receive') — the bare word false-positives on comments/identifiers.
  assertionMarkers: [
    "\\bassert\\w*\\b",
    "\\bexpect\\s*\\(",
    "\\.should\\b",
    "\\bshould_receive\\b",
    "\\.to(Be|Equal|Match|Throw|Have)",
    "\\brequire\\.(Equal|True|NoError)\\b",
  ],
  disabledCodes: [],
  ledgerPath: ".smelltest/ledger.jsonl",
  armedFlagPath: ".smelltest/armed",
};

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
function deepMerge<T>(base: T, over: unknown): T {
  if (!isObject(over)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const k of Object.keys(over)) {
    if (k === "//") continue;
    const b = (out as Record<string, unknown>)[k];
    out[k] =
      isObject(b) && isObject((over as Record<string, unknown>)[k])
        ? deepMerge(b, (over as Record<string, unknown>)[k])
        : (over as Record<string, unknown>)[k];
  }
  return out as T;
}

function validRegex(src: string): boolean {
  try {
    new RegExp(src, "i");
    return true;
  } catch {
    return false;
  }
}

// A malformed user-overridden pattern must NOT crash the Stop hook: bad fields revert to
// DEFAULTS. (Verified: an unbalanced testFilePattern throws an uncaught SyntaxError at the
// `new RegExp(...)` in detectTestTamper without this.)
function validateConfig(cfg: Config): Config {
  if (!validRegex(cfg.testFilePattern)) cfg.testFilePattern = DEFAULTS.testFilePattern;
  cfg.skipMarkers = (cfg.skipMarkers || []).filter(validRegex);
  if (!cfg.skipMarkers.length) cfg.skipMarkers = DEFAULTS.skipMarkers;
  cfg.assertionMarkers = (cfg.assertionMarkers || []).filter(validRegex);
  if (!cfg.assertionMarkers.length) cfg.assertionMarkers = DEFAULTS.assertionMarkers;
  // A malformed disabledCodes (non-array, or non-string entries) must not crash the kernel's
  // .includes() — coerce to a clean string[].
  cfg.disabledCodes = Array.isArray(cfg.disabledCodes)
    ? cfg.disabledCodes.filter((x): x is string => typeof x === "string")
    : [];
  // A malformed `bounds` is the load-bearing one: a non-numeric maxRevisions makes the gate's
  // `used >= NaN` comparison always false -> it would BLOCK forever (the exact runaway the fuse
  // exists to prevent). Coerce every bound to a safe non-negative integer, the same way budget is.
  const posInt = (x: unknown, d: number) =>
    typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : d;
  const bd = cfg.bounds && typeof cfg.bounds === "object" ? cfg.bounds : DEFAULTS.bounds;
  cfg.bounds = {
    maxRevisions: posInt(bd.maxRevisions, DEFAULTS.bounds.maxRevisions),
    absoluteIterationCeiling: posInt(bd.absoluteIterationCeiling, DEFAULTS.bounds.absoluteIterationCeiling),
    oscillationGuard:
      typeof bd.oscillationGuard === "boolean" ? bd.oscillationGuard : DEFAULTS.bounds.oscillationGuard,
    maxMinutes: posInt(bd.maxMinutes, DEFAULTS.bounds.maxMinutes),
  };

  // A malformed budget must not crash the gate or silently disable the cap: coerce to safe values.
  const b = cfg.budget && typeof cfg.budget === "object" ? cfg.budget : DEFAULTS.budget;
  cfg.budget = {
    enabled: typeof b.enabled === "boolean" ? b.enabled : DEFAULTS.budget.enabled,
    ceilingUsd:
      typeof b.ceilingUsd === "number" && Number.isFinite(b.ceilingUsd) && b.ceilingUsd >= 0
        ? b.ceilingUsd
        : DEFAULTS.budget.ceilingUsd,
  };
  return cfg;
}

function mergeFile(cfg: Config, file: string): Config {
  try {
    return deepMerge(cfg, JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return cfg; // absent or malformed file: leave the layer untouched (fail-open)
  }
}

// Two layers, low → high precedence: DEFAULTS → plugin-root config.json (ships with the
// plugin) → the project's own .smelltest/config.json (per-repo human overrides win). The
// project layer is what a user edits to tune or silence a finding in their repo.
export function loadConfig(pluginRoot?: string, projectRoot?: string): Config {
  const pluginDir = pluginRoot || process.env.CLAUDE_PLUGIN_ROOT || "";
  // Shallow clone so validateConfig's top-level reassignments never mutate the shared DEFAULTS
  // when no override file is present (deepMerge already returns fresh objects on the file paths).
  let cfg: Config = { ...DEFAULTS };
  if (pluginDir) cfg = mergeFile(cfg, path.join(pluginDir, "config.json"));
  if (projectRoot) cfg = mergeFile(cfg, path.join(projectRoot, ".smelltest", "config.json"));
  return validateConfig(cfg);
}

export function projectRoot(input?: { cwd?: string }): string {
  return process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd();
}
