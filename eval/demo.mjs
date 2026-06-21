#!/usr/bin/env node
// smelltest — one-command live demo. `npm run demo`.
// Spins up a throwaway git repo + a fake "all done" transcript whose diff added nothing real,
// arms the gate, and drives the SHIPPED Stop hook three times so you can WATCH the bounded fuse:
//   block -> block -> allow (revision cap reached). No mocks — this is the real hook on real stdin.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..");
const [maj, min] = process.versions.node.split(".").map(Number);
const canRunTs = maj > 22 || (maj === 22 && min >= 6);
const distHook = path.join(repoRoot, "dist", "hooks", "stop-gate.mjs");
const useDist = !canRunTs;
if (useDist && !fs.existsSync(distHook)) {
  console.error(
    `Node ${process.versions.node} can't run the .ts hook directly (need >= 22.6).\nBuild the dist bundle first:  npm install && npm run build`,
  );
  process.exit(1);
}
const HOOK = useDist ? distHook : path.join(repoRoot, "hooks", "stop-gate.ts");
const CLI = useDist ? path.join(repoRoot, "dist", "cli.mjs") : path.join(repoRoot, "src", "cli.ts");

const repo = fs.mkdtempSync(path.join(os.tmpdir(), "smelltest-demo-"));
const work = fs.mkdtempSync(path.join(os.tmpdir(), "smelltest-demo-work-"));
try {
  execFileSync("git", ["init", "-q"], { cwd: repo });
  // A "done" claim whose only change is a comment — the canonical false completion.
  const transcript = path.join(work, "t.jsonl");
  fs.writeFileSync(
    transcript,
    `${JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Implemented the feature. Tests pass." }],
      },
    })}\n`,
  );
  fs.writeFileSync(path.join(repo, "auth.js"), "// TODO: wire this up\n");
  const input = JSON.stringify({
    session_id: "demo",
    hook_event_name: "Stop",
    transcript_path: transcript,
    cwd: repo,
  });

  execFileSync(process.execPath, [CLI, "--root", repo, "arm"]);
  // Disable the oscillation guard so the identical claim can't short-circuit — we want to watch
  // the per-session CAP (the headline "blocks at most maxRevisions times") release the loop.
  fs.writeFileSync(
    path.join(repo, ".smelltest", "config.json"),
    JSON.stringify({ bounds: { oscillationGuard: false } }),
  );

  const run = () =>
    spawnSync(process.execPath, [HOOK], {
      input,
      env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
      encoding: "utf8",
    }).stdout.trim();

  console.log("\n  smelltest live demo — armed gate, false 'done', identical claim each turn\n");
  for (let i = 1; i <= 3; i++) {
    const out = run();
    const decision = /"decision":"block"/.test(out) ? "BLOCK" : "ALLOW";
    const first = out.split("\n")[0].slice(0, 150);
    console.log(`  turn ${i}:  ${decision}   ${first}`);
  }
  console.log("\n  ledger (the self-owned fuse, append-only):");
  for (const line of fs
    .readFileSync(path.join(repo, ".smelltest", "ledger.jsonl"), "utf8")
    .trim()
    .split("\n")) {
    const e = JSON.parse(line);
    console.log(`    ${e.event}`);
  }
  console.log("\n  ^ blocked at most twice, then the cap allowed the stop. It cannot run away.\n");
} finally {
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(work, { recursive: true, force: true });
}
