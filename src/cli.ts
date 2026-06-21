#!/usr/bin/env node
// smelltest CLI. Runs the structural kernel (no model, no network) and toggles enforcement.
//   smelltest --latest            re-grade the newest transcript (advisory)
//   smelltest --transcript <p>    re-grade a specific transcript
//   smelltest --stdin             read a (validated) Evidence JSON from stdin
//   smelltest --ci                exit 1 on a warn (for pipelines)
//   smelltest arm | disarm | status

import fs from "node:fs";
import path from "node:path";
import { loadConfig, projectRoot } from "./config.ts";
import { buildEvidence, findLatestTranscript } from "./evidence.ts";
import { renderVerdict, smell } from "./kernel.ts";
import type { Evidence } from "./types.ts";

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
  const root = get("--root") || projectRoot();
  const cfg = loadConfig(get("--plugin-root") || process.env.CLAUDE_PLUGIN_ROOT || undefined);
  const armedFile = path.join(root, cfg.armedFlagPath);

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
    console.error("smelltest: choose --stdin | --transcript <path> | --latest  (or arm | disarm | status)");
    return;
  }

  const v = smell(ev, cfg);
  console.log(renderVerdict(v));
  if (has("--json")) console.log(JSON.stringify(v, null, 2));
  if (has("--ci") && v.rung === "warn") process.exit(1);
}

main();
