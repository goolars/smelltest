#!/usr/bin/env node
// smelltest installer — wire it into a real project without the plugin marketplace.
//
//   node install.mjs --project <path-to-your-project> [--dist]
//
// Copies commands/agents/skills into <project>/.claude/ and merges the Stop/PostToolUse hooks
// into <project>/.claude/settings.json, resolving ${CLAUDE_PLUGIN_ROOT} to THIS repo so the
// hooks run from here. By default the hooks point at the `.ts` sources (Node >= 22.6 strips the
// types and runs them directly). On Node < 22.6 — or with --dist — the installer points the hooks
// at the built `dist/hooks/*.mjs` instead, and REFUSES to wire `.ts` hooks a Node it can't run
// (a silently-inert guardrail is worse than a loud error). Backs up any existing settings.json.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const hereSlash = here.replace(/\\/g, "/");
const get = (f) => {
  const i = process.argv.indexOf(f);
  return i >= 0 ? process.argv[i + 1] : null;
};

const target = get("--project");
if (!target) {
  console.error("Usage: node install.mjs --project <path-to-your-project>");
  process.exit(1);
}
const root = path.resolve(target);
if (!fs.existsSync(root)) {
  console.error(`Project not found: ${root}`);
  process.exit(1);
}

// Decide whether to wire .ts sources or the built dist/. Node strips TS types only on >= 22.6.
const [maj, min] = process.versions.node.split(".").map(Number);
const canRunTs = maj > 22 || (maj === 22 && min >= 6);
const useDist = process.argv.includes("--dist") || !canRunTs;
const distHook = path.join(here, "dist", "hooks", "stop-gate.mjs");
if (useDist && !fs.existsSync(distHook)) {
  const why = canRunTs
    ? "--dist was requested"
    : `Node ${process.versions.node} cannot run .ts hooks (need >= 22.6)`;
  console.error(
    `${why}, but no built dist/ was found at ${distHook}.\nBuild it first, then re-run this installer:\n  npm install && npm run build`,
  );
  process.exit(1);
}

const claude = path.join(root, ".claude");
for (const sub of ["commands", "agents", "skills"]) {
  const src = path.join(here, sub);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(claude, sub), { recursive: true });
}
// Resolve ${CLAUDE_PLUGIN_ROOT} in copied markdown so /smell etc. work without the plugin host.
function rewrite(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) rewrite(p);
    else if (/\.(md|json)$/.test(e.name))
      fs.writeFileSync(p, fs.readFileSync(p, "utf8").replaceAll("${CLAUDE_PLUGIN_ROOT}", hereSlash));
  }
}
for (const sub of ["commands", "agents", "skills"]) rewrite(path.join(claude, sub));
console.log(`✓ commands / agents / skills -> ${claude}`);

let hooksRaw = fs
  .readFileSync(path.join(here, "hooks", "hooks.json"), "utf8")
  .replaceAll("${CLAUDE_PLUGIN_ROOT}", hereSlash);
// dist mode: rewrite the hook commands from the .ts sources to the built .mjs bundle.
if (useDist) hooksRaw = hooksRaw.replace(/\/hooks\/([\w-]+)\.ts/g, "/dist/hooks/$1.mjs");
const pluginHooks = JSON.parse(hooksRaw).hooks;
const settingsPath = path.join(claude, "settings.json");
let settings = {};
if (fs.existsSync(settingsPath)) {
  fs.copyFileSync(settingsPath, `${settingsPath}.bak`);
  settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  console.log("  (backed up settings.json -> settings.json.bak)");
}
settings.hooks = settings.hooks || {};
for (const [event, arr] of Object.entries(pluginHooks)) {
  if (event === "//") continue;
  settings.hooks[event] = (settings.hooks[event] || []).concat(arr);
}
fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
console.log(`✓ hooks merged -> ${settingsPath}`);

console.log(`
Installed in ADVISORY mode (${useDist ? "dist/.mjs hooks" : ".ts hooks, Node >= 22.6"}) — nothing
blocks until you arm it.
  /smell            re-grade your last turn (advisory)
  /smell-loop on    arm enforcement (bounded: max 2 revisions, fail-open)
  /smell-loop off   disarm
First, prove it locally:  node --test   (from ${path.basename(here)}/)`);
