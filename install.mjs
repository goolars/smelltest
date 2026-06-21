#!/usr/bin/env node
// smelltest installer — wire it into a real project without the plugin marketplace.
//
//   node install.mjs --project <path-to-your-project>
//
// Copies commands/agents/skills into <project>/.claude/ and merges the Stop/PostToolUse hooks
// into <project>/.claude/settings.json, resolving ${CLAUDE_PLUGIN_ROOT} to THIS repo so the
// hooks run from here (Node >= 22.6 runs the .ts directly; or `npm run build` first and point
// the hooks at dist/). Backs up any existing settings.json.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const hereSlash = here.replace(/\\/g, '/');
const get = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };

const target = get('--project');
if (!target) { console.error('Usage: node install.mjs --project <path-to-your-project>'); process.exit(1); }
const root = path.resolve(target);
if (!fs.existsSync(root)) { console.error(`Project not found: ${root}`); process.exit(1); }

const claude = path.join(root, '.claude');
for (const sub of ['commands', 'agents', 'skills']) {
  const src = path.join(here, sub);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(claude, sub), { recursive: true });
}
// Resolve ${CLAUDE_PLUGIN_ROOT} in copied markdown so /smell etc. work without the plugin host.
function rewrite(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) rewrite(p);
    else if (/\.(md|json)$/.test(e.name)) fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replaceAll('${CLAUDE_PLUGIN_ROOT}', hereSlash));
  }
}
for (const sub of ['commands', 'agents', 'skills']) rewrite(path.join(claude, sub));
console.log(`✓ commands / agents / skills -> ${claude}`);

const pluginHooks = JSON.parse(fs.readFileSync(path.join(here, 'hooks', 'hooks.json'), 'utf8').replaceAll('${CLAUDE_PLUGIN_ROOT}', hereSlash)).hooks;
const settingsPath = path.join(claude, 'settings.json');
let settings = {};
if (fs.existsSync(settingsPath)) {
  fs.copyFileSync(settingsPath, settingsPath + '.bak');
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  console.log('  (backed up settings.json -> settings.json.bak)');
}
settings.hooks = settings.hooks || {};
for (const [event, arr] of Object.entries(pluginHooks)) {
  if (event === '//') continue;
  settings.hooks[event] = (settings.hooks[event] || []).concat(arr);
}
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log(`✓ hooks merged -> ${settingsPath}`);

console.log(`
Installed in ADVISORY mode — nothing blocks until you arm it. Requires Node >= 22.6 (or run
\`npm run build\` and point the hooks at dist/).
  /smell            re-grade your last turn (advisory)
  /smell-loop on    arm enforcement (bounded: max 2 revisions, fail-open)
  /smell-loop off   disarm
First, prove it locally:  node --test   (from ${path.basename(here)}/)`);
