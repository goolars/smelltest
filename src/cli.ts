#!/usr/bin/env node
// smelltest CLI. Runs the structural kernel (no model, no network) and toggles enforcement.
//   smelltest init [--project <p>] [--dist]   wire the hooks into a project's .claude/ (one command)
//   smelltest spend [--latest|--transcript <p>] [--json] [--ci]   estimated session token/$ cost
//   smelltest --latest            re-grade the newest transcript (advisory)
//   smelltest --transcript <p>    re-grade a specific transcript
//   smelltest --stdin             read a (validated) Evidence JSON from stdin
//   smelltest --ci                exit 1 on a warn (for pipelines)
//   smelltest arm | disarm | status

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { loadConfig, projectRoot } from "./config.ts";
import { renderSpend } from "./cost.ts";
import { buildEvidence, findLatestTranscript } from "./evidence.ts";
import { renderVerdict, smell } from "./kernel.ts";
import type { Evidence } from "./types.ts";

// `smelltest init` — the one-command install. Wires the Stop/PostToolUse hooks (and the /smell
// commands) into a project's .claude/ from THIS package, resolving ${CLAUDE_PLUGIN_ROOT} to wherever
// the package lives (works run-from-source OR via `npx smelltest`). Advisory by default. On Node
// < 22.6 (or with --dist) it points the hooks at the built dist/*.mjs and refuses to wire .ts a Node
// can't run — a silently-inert guardrail is worse than a loud error.
function runInit(argv: string[]): void {
  const get = (f: string) => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : null;
  };
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const pluginRoot = path.resolve(here, ".."); // package root: parent of src/ (source) or dist/ (npx)
  const pluginSlash = pluginRoot.replace(/\\/g, "/");
  const target = path.resolve(get("--project") || process.cwd());
  if (!fs.existsSync(target)) {
    console.error(`smelltest init: project not found: ${target}`);
    process.exit(1);
  }

  const [maj, min] = process.versions.node.split(".").map(Number);
  const canRunTs = maj > 22 || (maj === 22 && min >= 6);
  const useDist = argv.includes("--dist") || !canRunTs;
  const distHook = path.join(pluginRoot, "dist", "hooks", "stop-gate.mjs");
  if (useDist && !fs.existsSync(distHook)) {
    const why = canRunTs
      ? "--dist was requested"
      : `Node ${process.versions.node} can't run .ts hooks (need >= 22.6)`;
    console.error(
      `smelltest init: ${why}, but no built dist/ at ${distHook}.\nBuild it first:  npm install && npm run build`,
    );
    process.exit(1);
  }

  const claude = path.join(target, ".claude");
  for (const sub of ["commands", "agents", "skills"]) {
    const src = path.join(pluginRoot, sub);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(claude, sub), { recursive: true });
  }
  const rewrite = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) rewrite(p);
      else if (/\.(md|json)$/.test(e.name))
        fs.writeFileSync(p, fs.readFileSync(p, "utf8").replaceAll("${CLAUDE_PLUGIN_ROOT}", pluginSlash));
    }
  };
  for (const sub of ["commands", "agents", "skills"]) rewrite(path.join(claude, sub));

  let hooksRaw = fs
    .readFileSync(path.join(pluginRoot, "hooks", "hooks.json"), "utf8")
    .replaceAll("${CLAUDE_PLUGIN_ROOT}", pluginSlash);
  if (useDist) hooksRaw = hooksRaw.replace(/\/hooks\/([\w-]+)\.ts/g, "/dist/hooks/$1.mjs");
  const pluginHooks = JSON.parse(hooksRaw).hooks as Record<string, unknown[]>;
  const settingsPath = path.join(claude, "settings.json");
  let settings: { hooks?: Record<string, unknown[]> } = {};
  if (fs.existsSync(settingsPath)) {
    fs.copyFileSync(settingsPath, `${settingsPath}.bak`);
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  }
  settings.hooks = settings.hooks || {};
  for (const [event, arr] of Object.entries(pluginHooks)) {
    if (event === "//") continue;
    // Idempotent: drop any prior smelltest entries (by our hook script names) before re-adding, so
    // re-running `init` never stacks duplicate hooks.
    const kept = (settings.hooks[event] || []).filter(
      (g) => !/stop-gate|note-blind-edit/.test(JSON.stringify(g)),
    );
    settings.hooks[event] = kept.concat(arr);
  }
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);

  const rel = path.relative(process.cwd(), settingsPath) || settingsPath;
  console.log(
    [
      `✓ smelltest wired into ${rel}  (${useDist ? "dist/.mjs" : ".ts"} hooks, advisory)`,
      "",
      "  It watches and warns now — nothing blocks until you opt in.",
      "  Arm it:   npx smelltest arm    bounded: max 2 nudges on the same finding, then it allows — it can't loop",
      "  Watch it: npx smelltest demo   a real block -> block -> allow, on a throwaway repo",
      "",
      "  No model. No network. It reads your git diff, not your wallet.",
    ].join("\n"),
  );
}

function normalizeEvidence(p: any): Evidence {
  const okDiff = p && typeof p.diff === "object" && p.diff && Array.isArray(p.diff.hunks);
  const diff = okDiff
    ? {
        available: p.diff.available !== false,
        isEmpty: !!p.diff.isEmpty,
        filesTouched: Array.isArray(p.diff.filesTouched) ? p.diff.filesTouched : [],
        hunks: p.diff.hunks,
      }
    : { available: false, isEmpty: true, filesTouched: [], hunks: [] };
  const scope =
    p && typeof p.scope === "object" && p.scope
      ? {
          filesRead: Array.isArray(p.scope.filesRead) ? p.scope.filesRead : null,
          filesEdited: Array.isArray(p.scope.filesEdited) ? p.scope.filesEdited : [],
        }
      : { filesRead: null, filesEdited: [] };
  return { finalMessage: typeof p?.finalMessage === "string" ? p.finalMessage : "", diff, scope };
}

function main(): void {
  const argv = process.argv.slice(2);
  const has = (f: string) => argv.includes(f);
  const get = (f: string) => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : null;
  };
  if (argv.includes("init")) return runInit(argv);

  const root = get("--root") || projectRoot();
  // Pass `root` as the project layer so a CLI re-grade honors this repo's .smelltest/config.json
  // (disabledCodes, bounds) — same as the hooks do. Without it the CLI silently ignored it.
  const cfg = loadConfig(get("--plugin-root") || process.env.CLAUDE_PLUGIN_ROOT || undefined, root);
  const armedFile = path.join(root, cfg.armedFlagPath);

  // `smelltest spend [--latest|--transcript <p>] [--json] [--ci]` — the standalone cost surface
  // (same engine as the Stop gate). --ci exits 1 over the ceiling, for headless `claude -p` watchdogs.
  if (argv.includes("spend")) {
    const tpath = has("--latest") ? findLatestTranscript() : get("--transcript");
    if (!tpath) {
      console.error("smelltest spend: choose --latest or --transcript <path>");
      process.exit(2);
    }
    const s = buildEvidence({ transcriptPath: tpath, root }).spend;
    if (!s) {
      console.error("smelltest spend: no usage found in that transcript");
      process.exit(2);
    }
    if (has("--json")) console.log(JSON.stringify(s, null, 2));
    else console.log(`smelltest spend: ${renderSpend(s, cfg.budget.ceilingUsd)}`);
    if (has("--ci") && cfg.budget.ceilingUsd > 0 && s.usd >= cfg.budget.ceilingUsd) process.exit(1);
    return;
  }

  const sub = argv.find((a) => a === "arm" || a === "disarm" || a === "status");
  if (sub === "arm") {
    fs.mkdirSync(path.dirname(armedFile), { recursive: true });
    fs.writeFileSync(armedFile, `${new Date().toISOString()}\n`);
    console.log(
      `smelltest enforcement ARMED. Bounded: max ${cfg.bounds.maxRevisions} revisions, session-independent ceiling, fail-open. Disarm: smelltest disarm`,
    );
    return;
  }
  if (sub === "disarm") {
    try {
      fs.rmSync(armedFile, { force: true });
    } catch {
      /* noop */
    }
    console.log("smelltest enforcement DISARMED (advisory only).");
    return;
  }
  if (sub === "status") {
    console.log(
      `smelltest: enforcement ${fs.existsSync(armedFile) ? "ARMED" : "disarmed (advisory)"}; maxRevisions=${cfg.bounds.maxRevisions}`,
    );
    return;
  }

  let ev: Evidence;
  if (has("--stdin")) {
    ev = normalizeEvidence(JSON.parse(fs.readFileSync(0, "utf8")));
  } else if (has("--transcript") || has("--latest")) {
    ev = buildEvidence({
      transcriptPath: has("--latest") ? findLatestTranscript() : get("--transcript"),
      root,
    });
  } else {
    console.error(
      "smelltest: choose --stdin | --transcript <path> | --latest  (or init | arm | disarm | status)",
    );
    return;
  }

  const v = smell(ev, cfg);
  console.log(renderVerdict(v));
  if (has("--json")) console.log(JSON.stringify(v, null, 2));
  if (has("--ci") && v.rung === "warn") process.exit(1);
}

main();
