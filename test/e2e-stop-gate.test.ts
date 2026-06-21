// smelltest — END-TO-END test of the SHIPPED Stop hook (the path consumers actually run).
// Drives hooks/stop-gate.ts as a child process with realistic stdin + a fixture transcript in a
// temp git repo, and asserts the real {decision:"block"} then allow-after-bound. This is the
// coverage the README's "proven by execution" claim needs — the unit tests use synthetic
// evidence; this exercises the live stdin/transcript/git contract.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const HOOK = path.join(here, "..", "hooks", "stop-gate.ts");
const CLI = path.join(here, "..", "src", "cli.ts");

function setup() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "smelltest-e2e-"));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "smelltest-work-")); // sibling, NOT in the graded repo
  const transcript = path.join(work, "t.jsonl");
  const entry = {
    type: "assistant",
    message: { role: "assistant", content: [{ type: "text", text: "All done — implemented the feature." }] },
  };
  fs.writeFileSync(transcript, `${JSON.stringify(entry)}\n`);
  const input = JSON.stringify({
    session_id: "S",
    hook_event_name: "Stop",
    transcript_path: transcript,
    cwd: repo,
  });
  return { repo, work, input };
}
function runHook(repo: string, input: string) {
  return spawnSync(process.execPath, [HOOK], {
    input,
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
    encoding: "utf8",
  });
}
function cleanup(repo: string, work: string) {
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(work, { recursive: true, force: true });
}

test("e2e: armed gate blocks a false-done, then the oscillation guard releases it", () => {
  const { repo, work, input } = setup();
  execFileSync(process.execPath, [CLI, "--root", repo, "arm"]);

  const r1 = runHook(repo, input);
  assert.match(r1.stdout, /"decision":"block"/, "call 1 emits decision:block");
  assert.match(r1.stdout, /done\.no_substance/, "block reason names done.no_substance");

  // Identical claim again -> same finding code -> the oscillation guard (the stricter brake,
  // ahead of the per-session cap) releases the stop rather than thrashing on the same finding.
  const r2 = runHook(repo, input);
  assert.doesNotMatch(r2.stdout, /"decision":"block"/, "call 2 allows — the loop is bounded");

  const ledger = fs.readFileSync(path.join(repo, ".smelltest", "ledger.jsonl"), "utf8");
  assert.match(ledger, /"event":"block"/, "ledger records the block");
  assert.match(ledger, /"event":"allow_oscillation"/, "ledger records the oscillation release");
  cleanup(repo, work);
});

test("e2e: drives the maxRevisions cap end-to-end (oscillation disabled via project config)", () => {
  const { repo, work, input } = setup();
  execFileSync(process.execPath, [CLI, "--root", repo, "arm"]);
  // Turn off the oscillation guard for this repo so the IDENTICAL claim can't short-circuit on
  // the same finding — now only the per-session cap can stop the loop. This is the headline
  // "blocks at most maxRevisions (2) times, then allows" fuse, proven through the SHIPPED hook
  // (and it exercises project-level .smelltest/config.json loading at the same time).
  fs.writeFileSync(
    path.join(repo, ".smelltest", "config.json"),
    JSON.stringify({ bounds: { oscillationGuard: false } }),
  );

  assert.match(runHook(repo, input).stdout, /"decision":"block"/, "block 1 of 2 (used 0 -> 1)");
  assert.match(runHook(repo, input).stdout, /"decision":"block"/, "block 2 of 2 (used 1 -> 2)");

  const r3 = runHook(repo, input);
  assert.doesNotMatch(r3.stdout, /"decision":"block"/, "call 3 hits the cap and ALLOWS");
  assert.match(r3.stdout, /revision cap \(2\) reached/, "call 3 emits the cap message");

  const ledger = fs.readFileSync(path.join(repo, ".smelltest", "ledger.jsonl"), "utf8");
  assert.equal((ledger.match(/"event":"block"/g) || []).length, 2, "exactly 2 blocks — never more");
  assert.match(ledger, /"event":"allow_cap"/, "the cap, not oscillation, released the loop");
  cleanup(repo, work);
});

test("e2e: inert when disarmed (advisory by default)", () => {
  const { repo, work, input } = setup();
  const r = runHook(repo, input); // never armed
  assert.equal(r.status, 0, "exit 0");
  assert.equal(r.stdout.trim(), "", "no output when disarmed");
  cleanup(repo, work);
});

test("e2e: fail-open on malformed stdin", () => {
  const { repo, work } = setup();
  execFileSync(process.execPath, [CLI, "--root", repo, "arm"]);
  const r = runHook(repo, "not json at all");
  assert.equal(r.status, 0, "exit 0 on garbage stdin — never a hang or a block");
  assert.doesNotMatch(r.stdout, /"decision":"block"/, "no block on malformed input");
  cleanup(repo, work);
});
