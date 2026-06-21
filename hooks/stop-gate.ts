// smelltest — the Stop / SubagentStop gate. ADVISORY BY DEFAULT: inert unless armed.
// When armed, a warn-level structural finding blocks the stop to force one bounded revision,
// guarded by the ledger fuse (per-session cap -> session-independent ceiling -> oscillation),
// fail-open on any error. No hard 'block' severity ships in v1 (see README); arming turns a
// warn into a bounded block.

import fs from 'node:fs';
import path from 'node:path';
import { smell, renderVerdict } from '../src/kernel.ts';
import { buildEvidence } from '../src/evidence.ts';
import { loadConfig, projectRoot } from '../src/config.ts';
import * as ledger from '../src/ledger.ts';
import { readHookInput } from '../src/stdin.ts';

async function main(): Promise<void> {
  const input = await readHookInput();
  const allow = (msg?: string) => { if (msg) console.log(JSON.stringify({ systemMessage: msg })); process.exit(0); };
  try {
    const root = projectRoot(input);
    const cfg = loadConfig();
    const armed = path.join(root, cfg.armedFlagPath);
    if (!fs.existsSync(armed)) process.exit(0); // advisory by default

    if (input.hook_event_name === 'SubagentStop' && input.agent_type === 'smell-critic') process.exit(0);

    const sessionId = input.session_id || 'unknown';
    const used = ledger.revisionCount(root, cfg, sessionId);
    if (used >= cfg.bounds.maxRevisions) {
      ledger.append(root, cfg, { event: 'allow_cap', sessionId, used, cap: cfg.bounds.maxRevisions });
      allow(`smelltest: revision cap (${cfg.bounds.maxRevisions}) reached — allowing stop. Audit: .smelltest/ledger.jsonl`);
    }
    const ceiling = cfg.bounds.absoluteIterationCeiling ?? 4;
    if (ledger.recentBlockCount(root, cfg, ceiling * 3) >= ceiling) {
      ledger.append(root, cfg, { event: 'allow_ceiling', sessionId, ceiling });
      allow(`smelltest: absolute block ceiling (${ceiling}) reached — allowing stop (session-independent fuse).`);
    }

    const ev = buildEvidence({ transcriptPath: input.transcript_path, root });
    ev.sessionId = sessionId;
    const verdict = smell(ev, cfg);

    if (verdict.rung !== 'warn') {
      ledger.append(root, cfg, { event: verdict.rung, sessionId, codes: verdict.codes, notChecked: verdict.notChecked.map((n) => n.code) });
      process.exit(0);
    }
    if (cfg.bounds.oscillationGuard && ledger.isOscillating(root, cfg, sessionId, verdict.codes)) {
      ledger.append(root, cfg, { event: 'allow_oscillation', sessionId, codes: verdict.codes });
      allow('smelltest: same finding as last revision — allowing stop to avoid thrashing.');
    }

    ledger.append(root, cfg, { event: 'block', sessionId, codes: verdict.codes });
    const reason = [
      'smelltest blocked this stop — the completion claim is not backed by the diff:',
      ...verdict.findings.map((f) => `  • [${f.code}] ${f.message}`),
      '',
      'Make the REAL change (do not edit tests or soften the claim to pass).',
      `Bounded: blocks at most ${cfg.bounds.maxRevisions}x (used ${used + 1}), then allows. Disarm: smelltest disarm.`,
    ].join('\n');
    console.log(JSON.stringify({ decision: 'block', reason }));
    process.exit(0);
  } catch (e) {
    try { console.log(JSON.stringify({ systemMessage: 'smelltest: gate error, failing open (' + (e && (e as Error).message) + ')' })); } catch { /* noop */ }
    process.exit(0);
  }
}
void main();
