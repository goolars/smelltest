#!/usr/bin/env node
// smelltest — standalone CLI. Runs the FAST (deterministic) tier with no interactive
// session, for the /smell command and for CI pipelines. Also toggles the armed flag.
//
//   node bin/smell-cli.mjs --latest          re-grade the newest transcript (advisory)
//   node bin/smell-cli.mjs --transcript P     re-grade a specific transcript
//   node bin/smell-cli.mjs --stdin            read an evidence JSON object from stdin
//   node bin/smell-cli.mjs --ci               exit 1 on BLOCK (for pipelines)
//   node bin/smell-cli.mjs arm | disarm | status

import fs from 'node:fs';
import path from 'node:path';
import { smell, smellSlow, renderVerdict } from './smell.mjs';
import { buildEvidence, findLatestTranscript } from './extract-evidence.mjs';
import { loadConfig, projectRoot } from './lib/config.mjs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const get = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

const root = get('--root') || projectRoot();
const cfg = loadConfig(get('--plugin-root') || process.env.CLAUDE_PLUGIN_ROOT);
const armedFile = path.join(root, cfg.armedFlagPath);

const sub = argv.find((a) => a === 'arm' || a === 'disarm' || a === 'status');
if (sub === 'arm') {
  fs.mkdirSync(path.dirname(armedFile), { recursive: true });
  fs.writeFileSync(armedFile, new Date().toISOString() + '\n');
  console.log(`smelltest enforcement ARMED. Max ${cfg.bounds.maxRevisions} revision(s), fail-open. Disarm: node bin/smell-cli.mjs disarm`);
  process.exit(0);
}
if (sub === 'disarm') {
  try { fs.rmSync(armedFile, { force: true }); } catch {}
  console.log('smelltest enforcement DISARMED (advisory only).');
  process.exit(0);
}
if (sub === 'status') {
  console.log(`smelltest: enforcement ${fs.existsSync(armedFile) ? 'ARMED' : 'disarmed (advisory)'}; maxRevisions=${cfg.bounds.maxRevisions}; slowTier=${cfg.slowTier.enabled ? 'on' : 'off'}`);
  process.exit(0);
}

async function main() {
  let ev;
  if (has('--stdin')) {
    const raw = fs.readFileSync(0, 'utf8');
    ev = JSON.parse(raw);
  } else if (has('--transcript') || has('--latest')) {
    const tp = has('--latest') ? findLatestTranscript() : get('--transcript');
    ev = buildEvidence({ transcriptPath: tp, root });
  } else {
    console.error('smelltest: choose an input — --stdin, --transcript <path>, or --latest. (or: arm | disarm | status)');
    process.exit(0);
  }
  const verdict = smell(ev, cfg);
  const slowFindings = await smellSlow(ev, cfg);
  console.log(renderVerdict(verdict, { slowFindings }));
  if (has('--json')) console.log(JSON.stringify({ verdict, slowFindings }, null, 2));
  if (has('--ci') && verdict.rung === 'block') process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  // Fail-open: a broken gate degrades to advisory, never to a hard error.
  console.error('smelltest: extractor error (fail-open):', e && e.message);
  process.exit(0);
});
