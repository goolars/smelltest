#!/usr/bin/env node
// smelltest installer — wire it into a real project today, without the plugin marketplace.
//
//   node install.mjs --project <path-to-your-project>
//
// Copies commands/agents/skills into <project>/.claude/, and merges the hooks into
// <project>/.claude/settings.json with ${CLAUDE_PLUGIN_ROOT} resolved to THIS repo's
// absolute path (so the bundled node scripts run). Backs up any existing settings.json.
//
// (As a Claude Code plugin, smelltest also loads directly via the plugin system — see
// README. This installer is the zero-marketplace path.)

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const get = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };

const target = get('--project');
if (!target) { console.error('Usage: node install.mjs --project <path-to-your-project>'); process.exit(1); }
const root = path.resolve(target);
if (!fs.existsSync(root)) { console.error(`Project not found: ${root}`); process.exit(1); }

const claude = path.join(root, '.claude');
for (const sub of ['commands', 'agents', 'skills']) {
  fs.cpSync(path.join(here, sub), path.join(claude, sub), { recursive: true });
}
console.log(`✓ commands / agents / skills -> ${claude}`);

// Merge hooks, resolving ${CLAUDE_PLUGIN_ROOT} to this repo.
const hooksRaw = fs.readFileSync(path.join(here, 'hooks', 'hooks.json'), 'utf8').replaceAll('${CLAUDE_PLUGIN_ROOT}', here.replace(/\\/g, '/'));
const pluginHooks = JSON.parse(hooksRaw).hooks;

const settingsPath = path.join(claude, 'settings.json');
let settings = {};
if (fs.existsSync(settingsPath)) {
  fs.copyFileSync(settingsPath, settingsPath + '.bak');
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  console.log('  (backed up settings.json -> settings.json.bak)');
}
settings.hooks = settings.hooks || {};
for (const [event, arr] of Object.entries(pluginHooks)) {
  settings.hooks[event] = (settings.hooks[event] || []).concat(arr);
}
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log(`✓ hooks merged -> ${settingsPath}`);

console.log(`
Installed (advisory mode — nothing blocks yet).
  /smell                 re-grade your last turn (advisory)
  /smell-loop on         arm enforcement (bounded: max ${2} revisions, fail-open)
  /smell-loop off        disarm
Active by default: the destructive-command guard (asks before irreversible deletes).
Run the test suite first:  node --test  (from ${path.basename(here)}/)`);
