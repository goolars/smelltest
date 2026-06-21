// smelltest — canonical configuration. DEFAULTS is the single source of truth; a shipped
// config.json (if any) may only override these keys. No duplicated literal blocks.

import fs from 'node:fs';
import path from 'node:path';

export interface Config {
  bounds: { maxRevisions: number; absoluteIterationCeiling: number; oscillationGuard: boolean; maxMinutes: number };
  // claim kind -> phrases that signal it. A marginally-better-than-naive lexeme scan, NOT
  // robustness: a neutral completion ("the handler now returns 200") evades it by design.
  // The residual evasion rate is measured by eval/run.ts, not asserted away.
  claimLexicon: Record<string, string[]>;
  negators: string[];
  // file extension -> line-comment / block-comment prefixes used by the substance classifier.
  commentPrefixes: Record<string, string[]>;
  testFilePattern: string;    // a file is a "test" file if its path matches this (regex source)
  skipMarkers: string[];      // added lines that disable a test (regex sources)
  assertionMarkers: string[]; // removed lines that drop an assertion (regex sources)
  ledgerPath: string;
  armedFlagPath: string;
}

export const DEFAULTS: Config = {
  bounds: { maxRevisions: 2, absoluteIterationCeiling: 4, oscillationGuard: true, maxMinutes: 30 },
  claimLexicon: {
    implemented: [
      'implemented', 'added', 'created', 'built', 'wrote', 'wired up', 'wired it up',
      'done', 'complete', 'completed', 'finished', 'shipped', 'ready to go', 'all set',
      'good to go', 'should be good', 'should do it', "that's done", 'in place now',
    ],
    fixed: ['fixed', 'resolved', 'patched', 'corrected', 'repaired', 'works now', 'working now', 'fully working'],
    tested: ['tests pass', 'tests are passing', 'passing now', 'all tests pass', 'test suite passes', 'tests green', 'verified', 'tests now pass'],
    removed: ['removed', 'deleted', 'dropped', 'cleaned out'],
    refactored: ['refactored', 'cleaned up', 'restructured', 'reorganized'],
  },
  negators: [
    'not', 'never', 'cannot', "can't", "couldn't", "won't", "wasn't", "isn't", "aren't",
    "haven't", "hasn't", "hadn't", "didn't", "don't", "doesn't", 'unable', 'fail', 'failed',
    'incomplete', 'unfinished', 'still need', 'still needs', 'not yet', 'to do', 'remaining', 'yet to',
  ],
  commentPrefixes: {
    js: ['//', '/*', '*'], mjs: ['//', '/*', '*'], cjs: ['//', '/*', '*'],
    ts: ['//', '/*', '*'], tsx: ['//', '/*', '*'], jsx: ['//', '/*', '*'],
    java: ['//', '/*', '*'], kt: ['//', '/*', '*'], scala: ['//', '/*', '*'],
    c: ['//', '/*', '*'], h: ['//', '/*', '*'], cpp: ['//', '/*', '*'], cc: ['//', '/*', '*'], cs: ['//', '/*', '*'],
    go: ['//', '/*', '*'], rs: ['//', '/*', '*'], swift: ['//', '/*', '*'], php: ['//', '/*', '*', '#'],
    py: ['#'], rb: ['#'], sh: ['#'], bash: ['#'], yaml: ['#'], yml: ['#'], toml: ['#'], r: ['#'],
    sql: ['--'], lua: ['--'], css: ['/*', '*'], scss: ['//', '/*', '*'],
  },
  testFilePattern: '(^|[/\\\\])(tests?|spec|__tests__)([/\\\\])|\\.(test|spec)\\.[a-z0-9]+$|_test\\.[a-z0-9]+$',
  skipMarkers: ['\\.skip\\b', '\\.only\\b', '\\bxit\\b', '\\bxdescribe\\b', '@pytest\\.mark\\.skip', '@unittest\\.skip', '\\bt\\.Skip\\b', '#\\[ignore\\]'],
  assertionMarkers: ['\\bassert\\w*\\b', '\\bexpect\\s*\\(', '\\bshould\\b', '\\.to(Be|Equal|Match|Throw|Have)', '\\brequire\\.(Equal|True|NoError)\\b'],
  ledgerPath: '.smelltest/ledger.jsonl',
  armedFlagPath: '.smelltest/armed',
};

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
function deepMerge<T>(base: T, over: unknown): T {
  if (!isObject(over)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const k of Object.keys(over)) {
    if (k === '//') continue;
    const b = (out as Record<string, unknown>)[k];
    out[k] = isObject(b) && isObject((over as Record<string, unknown>)[k]) ? deepMerge(b, (over as Record<string, unknown>)[k]) : (over as Record<string, unknown>)[k];
  }
  return out as T;
}

export function loadConfig(root?: string): Config {
  const dir = root || process.env.CLAUDE_PLUGIN_ROOT || '';
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
    return deepMerge(DEFAULTS, raw);
  } catch {
    return DEFAULTS;
  }
}

export function projectRoot(input?: { cwd?: string }): string {
  return process.env.CLAUDE_PROJECT_DIR || (input && input.cwd) || process.cwd();
}
