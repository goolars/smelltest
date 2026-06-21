// smelltest — verifies extract-evidence against the REAL Claude Code transcript schema.
// Confirmed by reading actual ~/.claude/projects/*.jsonl (June 2026): each turn is split into
// SEPARATE per-block JSONL entries (thinking / text / tool_use are distinct lines, NOT one
// content array), non-message entries like "queue-operation" are interleaved, and Read/Edit/
// Write tool_use blocks carry input.file_path. This fixture locks that contract in so a schema
// drift breaks a test instead of silently no-op-ing the gate in production.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { DEFAULTS, loadConfig } from "../src/config.ts";
import { buildEvidence, parseUnifiedDiff } from "../src/evidence.ts";
import { smell } from "../src/kernel.ts";

test("evidence: parses the real per-block transcript schema", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "smelltest-"));
  execFileSync("git", ["init", "-q"], { cwd: root });

  const entries = [
    { type: "queue-operation", operation: "noop", timestamp: "t" }, // non-message line, must be ignored
    { type: "user", message: { role: "user", content: [{ type: "text", text: "fix the auth bug" }] } },
    {
      type: "assistant",
      message: { role: "assistant", content: [{ type: "thinking", thinking: "reasoning…" }] },
    },
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "src/auth.ts" } }],
      },
    },
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "t2",
            name: "Edit",
            input: { file_path: "src/auth.ts", old_string: "a", new_string: "b" },
          },
        ],
      },
    },
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "tool_use", id: "t3", name: "Write", input: { file_path: "src/new.ts", content: "x" } },
        ],
      },
    },
    {
      type: "assistant",
      message: { role: "assistant", content: [{ type: "text", text: "Done — implemented the fix." }] },
    },
  ];
  const tr = path.join(root, "t.jsonl");
  fs.writeFileSync(tr, entries.map((e) => JSON.stringify(e)).join("\n"));

  const ev = buildEvidence({ transcriptPath: tr, root });
  assert.equal(ev.finalMessage, "Done — implemented the fix.", "the last text block is the final message");
  assert.ok(ev.scope.filesRead?.includes("src/auth.ts"), "Read target captured");
  assert.ok(ev.scope.filesEdited.includes("src/auth.ts"), "Edit target captured");
  assert.ok(ev.scope.filesEdited.includes("src/new.ts"), "Write target captured");

  fs.rmSync(root, { recursive: true, force: true });
});

test("parser: path from the authoritative +++ line, not ambiguous diff --git (space + literal b/)", () => {
  const h = parseUnifiedDiff(
    "diff --git a/lib b/c.ts b/lib b/c.ts\n--- a/lib b/c.ts\n+++ b/lib b/c.ts\n@@ -0,0 +1 @@\n+export const z = 1",
  )[0];
  assert.equal(h.file, "lib b/c.ts");
  assert.deepEqual(h.addedLines, ["export const z = 1"]);
});

test('parser: rename uses "rename to" path and records renamedFrom', () => {
  const h = parseUnifiedDiff(
    "diff --git a/test/auth.test.ts b/test/login.test.ts\nsimilarity index 96%\nrename from test/auth.test.ts\nrename to test/login.test.ts\n@@ -1 +1 @@\n-  expect(x).toBe(1)\n+  expect(x).toBe(2)",
  )[0];
  assert.equal(h.file, "test/login.test.ts");
  assert.equal(h.renamedFrom, "test/auth.test.ts");
});

test("parser: C-quoted unicode path is decoded", () => {
  const h = parseUnifiedDiff(
    'diff --git "a/caf\\303\\251.ts" "b/caf\\303\\251.ts"\n--- "a/caf\\303\\251.ts"\n+++ "b/caf\\303\\251.ts"\n@@ -0,0 +1 @@\n+const x = 1',
  )[0];
  assert.equal(h.file, "café.ts");
});

test("parser: deletion sets deleted and keeps the old path", () => {
  const h = parseUnifiedDiff(
    'diff --git a/test/foo.test.ts b/test/foo.test.ts\ndeleted file mode 100644\n--- a/test/foo.test.ts\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-test("a")\n-test("b")',
  )[0];
  assert.equal(h.deleted, true);
  assert.equal(h.file, "test/foo.test.ts");
});

test("parser: mode-only change yields a clean empty hunk", () => {
  const h = parseUnifiedDiff("diff --git a/run.sh b/run.sh\nold mode 100644\nnew mode 100755")[0];
  assert.equal(h.file, "run.sh");
  assert.deepEqual(h.addedLines, []);
});

test("parser: binary file flagged, body skipped", () => {
  const h = parseUnifiedDiff(
    "diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ",
  )[0];
  assert.equal(h.binary, true);
  assert.deepEqual(h.addedLines, []);
});

test("parser: combined (--cc) diff flagged and body skipped", () => {
  const h = parseUnifiedDiff("diff --cc src/x.js\n@@@ -1,1 -1,1 +1,2 @@@\n++added\n")[0];
  assert.equal(h.combined, true);
  assert.deepEqual(h.addedLines, []);
});

test('parser: "\\ No newline at end of file" is not counted as content', () => {
  const h = parseUnifiedDiff(
    "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-a\n+b\n\\ No newline at end of file",
  )[0];
  assert.deepEqual(h.addedLines, ["b"]);
  assert.deepEqual(h.removedLines, ["a"]);
});

test("config: a malformed override regex reverts to default instead of crashing the gate", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "smelltest-"));
  fs.writeFileSync(
    path.join(root, "config.json"),
    JSON.stringify({ skipMarkers: ["("], testFilePattern: "(" }),
  );
  const cfg = loadConfig(root);
  assert.deepEqual(cfg.skipMarkers, DEFAULTS.skipMarkers, "bad skipMarkers reverted");
  assert.equal(cfg.testFilePattern, DEFAULTS.testFilePattern, "bad testFilePattern reverted");
  const ev = {
    finalMessage: "Tests pass.",
    diff: {
      available: true,
      isEmpty: false,
      filesTouched: ["a.test.js"],
      hunks: [{ file: "a.test.js", addedLines: ['  it.skip("x", () => {})'], removedLines: [] }],
    },
    scope: { filesRead: [], filesEdited: [] },
  };
  assert.equal(smell(ev as any, cfg).rung, "warn", "gate still runs (and catches) with reverted config");
  fs.rmSync(root, { recursive: true, force: true });
});
