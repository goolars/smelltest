// smelltest — config loading. Falls back to built-in DEFAULTS so the gate never
// breaks just because config.json is missing or malformed (fail-open philosophy).

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULTS = {
  version: 1,
  bounds: { maxRevisions: 2, absoluteIterationCeiling: 4, oscillationGuard: true },
  fastTier: {
    completionLexemes: [
      'done', 'complete', 'completed', 'implemented', 'finished', 'fixed',
      'resolved', 'all set', 'ready to go', 'verified', 'tests pass',
      'tests are passing', 'passing now', 'working now', 'fully working',
    ],
    confidenceLexemes: [
      'definitely', 'guaranteed', 'certainly', '100%', 'without a doubt',
      "i've verified", 'i verified', "i've tested", 'i tested', 'i confirmed',
      'absolutely correct', 'this will work',
    ],
  },
  slowTier: { enabled: false, citationResolveTimeoutMs: 4000, demoteUncited: true, echoSingleDomainWarn: true },
  destructive: {
    enabled: true,
    patterns: [
      'rm\\s+-[a-z]*r[a-z]*f', 'rm\\s+-[a-z]*f[a-z]*r', 'rm\\s+-[a-z]*r\\b.*\\*',
      'git\\s+reset\\s+--hard', 'git\\s+clean\\s+-[a-z]*f', 'git\\s+checkout\\s+--\\s',
      'git\\s+push\\s+--force(?!-with-lease)', 'remove-item\\b.*-recurse',
      'rmdir\\s+/s', 'rd\\s+/s', 'del\\s+/[a-z]*s', 'mkfs', 'dd\\s+if=',
      'truncate\\s+-s\\s*0', '>\\s*/dev/sd', 'format\\s+[a-z]:',
      'rm\\s+.*--recursive', 'shred\\b', 'find\\s+.*-delete', 'git\\s+branch\\s+-D',
    ],
  },
  ledgerPath: '.smelltest/ledger.jsonl',
  armedFlagPath: '.smelltest/armed',
};

function isObject(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function deepMerge(base, over) {
  if (!isObject(over)) return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(over)) {
    if (k === '//') continue;
    out[k] = isObject(out[k]) && isObject(over[k]) ? deepMerge(out[k], over[k]) : over[k];
  }
  return out;
}

export function loadConfig(pluginRoot) {
  const root = pluginRoot || process.env.CLAUDE_PLUGIN_ROOT || '';
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
    return deepMerge(DEFAULTS, raw);
  } catch {
    return DEFAULTS;
  }
}

export function projectRoot(input = {}) {
  return process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
}
