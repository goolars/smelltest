#!/usr/bin/env node
// smelltest — THE GATE. A deterministic `command`-type Stop / SubagentStop hook. We keep
// the blocker model-free BY DESIGN: the thing that blocks you must not itself be a model,
// because a model's confidence in its own output is exactly what this tool distrusts.
//
// Order of operations is deliberate and safety-first:
//   1. Disarmed (default) -> do nothing. Enforcement is opt-in.
//   2. Read the SELF-OWNED revision count from the ledger FIRST. At/over the cap -> ALLOW
//      the stop. We do NOT rely on any platform cap or stop_hook_active signal — whether or
//      not the runtime has one, this ledger is an independent, self-owned bound.
//   3. Only then run the fast (model-free, network-free) kernel.
//   4. Oscillation guard: same failure as last time -> ALLOW (stop thrashing).
//   5. BLOCK at most until the cap, recording every decision to the ledger.
//   6. ANY error anywhere -> ALLOW (fail-open). A broken gate must never deadlock a turn.

import fs from 'node:fs';
import path from 'node:path';
import { smell } from '../bin/smell.mjs';
import { buildEvidence } from '../bin/extract-evidence.mjs';
import { loadConfig, projectRoot } from '../bin/lib/config.mjs';
import * as ledger from '../bin/lib/ledger.mjs';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) return resolve({});
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    process.stdin.on('error', () => resolve({}));
    setTimeout(() => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } }, 2000).unref?.();
  });
}

const allow = (systemMessage) => {
  if (systemMessage) console.log(JSON.stringify({ systemMessage }));
  process.exit(0);
};

try {
  const input = await readStdin();
  const root = projectRoot(input);
  const cfg = loadConfig();
  const armed = path.join(root, cfg.armedFlagPath);

  if (!fs.existsSync(armed)) process.exit(0);                 // 1. disarmed -> inert

  // Never recurse on our own critic subagent.
  if (input.hook_event_name === 'SubagentStop' && input.agent_type === 'smell-critic') process.exit(0);

  const sessionId = input.session_id || 'unknown';
  const used = ledger.revisionCount(root, cfg, sessionId);

  if (used >= cfg.bounds.maxRevisions) {                      // 2. per-session cap -> allow
    ledger.append(root, cfg, { event: 'allow_cap', sessionId, used, cap: cfg.bounds.maxRevisions });
    allow(`smelltest: revision cap (${cfg.bounds.maxRevisions}) reached — allowing stop. Audit: .smelltest/ledger.jsonl`);
  }

  // 2b. Session-INDEPENDENT absolute fuse — binds even if session_id semantics change.
  const ceiling = cfg.bounds.absoluteIterationCeiling ?? 4;
  if (ledger.recentBlockCount(root, cfg, ceiling * 3) >= ceiling) {
    ledger.append(root, cfg, { event: 'allow_ceiling', sessionId, ceiling });
    allow(`smelltest: absolute block ceiling (${ceiling}) reached across recent turns — allowing stop (session-independent fuse).`);
  }

  const ev = buildEvidence({ transcriptPath: input.transcript_path, root });
  ev.sessionId = sessionId;
  const verdict = smell(ev, cfg);                             // 3. deterministic kernel

  if (verdict.rung !== 'block') {
    ledger.append(root, cfg, { event: verdict.rung, sessionId, codes: verdict.codes, notChecked: verdict.notChecked.map((n) => n.code) });
    process.exit(0);
  }

  if (cfg.bounds.oscillationGuard && ledger.isOscillating(root, cfg, sessionId, verdict.codes)) { // 4.
    ledger.append(root, cfg, { event: 'allow_oscillation', sessionId, codes: verdict.codes });
    allow('smelltest: same finding as last revision — allowing stop to avoid thrashing. Audit: .smelltest/ledger.jsonl');
  }

  ledger.append(root, cfg, { event: 'block', sessionId, codes: verdict.codes, findings: verdict.findings.map((f) => ({ code: f.code, message: f.message })) }); // 5.

  const reason = [
    'smelltest blocked this stop — the turn claims completion that the deterministic checks could not verify:',
    ...verdict.findings.map((f) => `  • [${f.code}] ${f.message}`),
    '',
    `Fix the underlying issue, then finish. Do NOT edit tests or weaken claims to pass — that is the exact behavior this gate exists to catch.`,
    `This will block at most ${cfg.bounds.maxRevisions} time(s) (used ${used + 1}); after that it allows the stop. Disarm: node "${process.env.CLAUDE_PLUGIN_ROOT || '<plugin>'}/bin/smell-cli.mjs" disarm`,
  ].join('\n');

  console.log(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
} catch (e) {
  // 6. fail-open
  try { console.log(JSON.stringify({ systemMessage: 'smelltest: gate error, failing open (' + (e && e.message) + ')' })); } catch {}
  process.exit(0);
}
