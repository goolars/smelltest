// smelltest — build the Evidence object from the transcript + git. The diff is now parsed
// into hunks (git diff --unified=0) so the kernel derives substantive-line facts itself
// instead of trusting an upstream boolean. Best-effort + fail-soft: whatever can't be
// determined is left so the kernel records a notChecked gap, never a false pass.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPrices, sessionCost } from "./cost.ts";
import type { DiffHunk, DiffInfo, Evidence } from "./types.ts";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}
function isOurs(p: string): boolean {
  const s = p.replace(/\\/g, "/");
  return /^\.smelltest(\/|$)/.test(s) || /^\.git(\/|$)/.test(s);
}

// Decode a git C-quoted path (core.quotePath): "b/caf\303\251.ts" -> b/café.ts. Octal runs are
// bytes; the whole byte sequence is decoded as UTF-8. (git's documented quoting; idea-only.)
function unquotePath(p: string): string {
  if (p.length < 2 || p[0] !== '"' || p[p.length - 1] !== '"') return p;
  const inner = p.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "\\" && i + 1 < inner.length) {
      const n = inner[i + 1];
      if (n === "t") {
        bytes.push(9);
        i++;
      } else if (n === "n") {
        bytes.push(10);
        i++;
      } else if (n === "r") {
        bytes.push(13);
        i++;
      } else if (n === "\\") {
        bytes.push(92);
        i++;
      } else if (n === '"') {
        bytes.push(34);
        i++;
      } else if (n >= "0" && n <= "7") {
        bytes.push(Number.parseInt(inner.slice(i + 1, i + 4), 8) & 0xff);
        i += 3;
      } else {
        bytes.push(inner.charCodeAt(i));
      }
    } else {
      bytes.push(inner.charCodeAt(i) & 0xff);
    }
  }
  try {
    return Buffer.from(bytes).toString("utf8");
  } catch {
    return inner;
  }
}

function stripPrefix(p: string): string {
  return p.replace(/^[abiwco12]\//, "");
}

// Two-mode (header / body) state machine. The file path comes from the AUTHORITATIVE '+++ '
// (or 'rename to') line, NOT the ambiguous `diff --git a/.. b/..` (which mis-captures on paths
// containing spaces or a literal " b/"). Handles rename/copy, new/deleted (/dev/null), binary,
// mode-only, combined (--cc / @@@) diffs, and the "\ No newline" marker. Idea-only re-implementation
// of the concepts in parse-diff & gitdiff-parser (both MIT) + git's documented format — see CREDITS.md.
export function parseUnifiedDiff(text: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let cur: DiffHunk | null = null;
  let mode: "header" | "body" | "skip" = "header";

  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git") || line.startsWith("diff --cc") || line.startsWith("diff --combined")) {
      cur = { file: "", addedLines: [], removedLines: [] };
      hunks.push(cur);
      mode = "header";
      if (!line.startsWith("diff --git ")) cur.combined = true;
      const m = / b\/(.+)$/.exec(line);
      if (m) cur.file = stripPrefix(unquotePath(m[1].trim())); // fallback only; '+++' overrides
      continue;
    }
    if (!cur) continue;
    if (mode === "skip") continue;

    if (mode === "header") {
      if (line.startsWith("--- ")) {
        const p = line.slice(4).trim();
        if (p !== "/dev/null") cur.oldPath = stripPrefix(unquotePath(p));
        continue;
      }
      if (line.startsWith("+++ ")) {
        const p = line.slice(4).trim();
        if (p === "/dev/null") {
          cur.deleted = true;
          if (cur.oldPath) cur.file = cur.oldPath;
        } else cur.file = stripPrefix(unquotePath(p));
        continue;
      }
      if (line.startsWith("rename from ") || line.startsWith("copy from ")) {
        cur.renamedFrom = unquotePath(line.replace(/^(rename|copy) from /, "").trim());
        continue;
      }
      if (line.startsWith("rename to ") || line.startsWith("copy to ")) {
        cur.file = unquotePath(line.replace(/^(rename|copy) to /, "").trim());
        continue;
      }
      if (line.startsWith("deleted file mode")) {
        cur.deleted = true;
        continue;
      }
      if (line.startsWith("Binary files") || line.startsWith("GIT binary patch")) {
        cur.binary = true;
        mode = "skip";
        continue;
      }
      if (line.startsWith("@@@")) {
        cur.combined = true;
        mode = "skip";
        continue;
      }
      if (line.startsWith("@@")) {
        mode = "body";
        continue;
      }
      continue; // index / old mode / new mode / similarity / etc.
    }

    // body mode — at --unified=0 there are no context lines
    if (line.startsWith("@@@")) {
      cur.combined = true;
      mode = "skip";
      continue;
    }
    if (line.startsWith("\\")) continue; // "\ No newline at end of file" — not content
    if (line.startsWith("+")) {
      cur.addedLines.push(line.slice(1));
      continue;
    }
    if (line.startsWith("-")) {
      cur.removedLines.push(line.slice(1));
    }
  }
  return hunks;
}

export function gitDiffInfo(root: string): DiffInfo {
  try {
    git(root, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    return { available: false, isEmpty: true, filesTouched: [], hunks: [] };
  }

  const touched: string[] = [];
  const untracked: string[] = [];
  try {
    for (const l of git(root, ["status", "--porcelain"]).split("\n").filter(Boolean)) {
      const status = l.slice(0, 2);
      const file = l.slice(3).trim();
      if (!file || isOurs(file)) continue;
      touched.push(file);
      if (status.includes("?")) untracked.push(file);
    }
  } catch {
    /* leave empty */
  }

  const hunks: DiffHunk[] = [];
  try {
    hunks.push(...parseUnifiedDiff(git(root, ["diff", "--unified=0"])));
    hunks.push(...parseUnifiedDiff(git(root, ["diff", "--unified=0", "--cached"])));
  } catch {
    /* leave empty */
  }

  for (const f of untracked) {
    try {
      const abs = path.join(root, f);
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        const buf = fs.readFileSync(abs);
        const isBinary = buf.subarray(0, 8192).includes(0); // NUL byte => binary, not 0 lines of "code"
        hunks.push(
          isBinary
            ? { file: f, addedLines: [], removedLines: [], binary: true }
            : { file: f, addedLines: buf.toString("utf8").split("\n"), removedLines: [] },
        );
      }
    } catch {
      /* skip */
    }
  }

  const clean = hunks.filter((h) => h.file && !isOurs(h.file));
  return { available: true, isEmpty: touched.length === 0, filesTouched: touched, hunks: clean };
}

function readJsonl(file: string): Record<string, unknown>[] {
  try {
    return fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter((x): x is Record<string, unknown> => x !== null);
  } catch {
    return [];
  }
}
function blocksOf(entry: any): any[] {
  const m = entry?.message ? entry.message : entry;
  const c = m?.content;
  if (Array.isArray(c)) return c;
  if (typeof c === "string") return [{ type: "text", text: c }];
  return [];
}
function roleOf(entry: any): string {
  return (entry && (entry.role || entry.message?.role || entry.type)) || "";
}
function lastAssistantText(entries: any[]): string {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (String(roleOf(entries[i])).includes("assistant")) {
      const txt = blocksOf(entries[i])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (txt) return txt;
    }
  }
  return "";
}
function toolFiles(entries: any[]): { read: string[]; edited: string[] } {
  const read: string[] = [];
  const edited: string[] = [];
  const readNames = new Set(["Read", "NotebookRead"]);
  const editNames = new Set(["Edit", "Write", "NotebookEdit"]);
  for (const e of entries) {
    for (const b of blocksOf(e)) {
      if (b && b.type === "tool_use") {
        const fp = b.input && (b.input.file_path || b.input.path || b.input.notebook_path);
        if (!fp) continue;
        if (readNames.has(b.name)) read.push(fp);
        if (editNames.has(b.name)) edited.push(fp);
      }
    }
  }
  return { read: [...new Set(read)], edited: [...new Set(edited)] };
}

export function buildEvidence(opts: {
  transcriptPath?: string | null;
  root?: string;
  finalMessageOverride?: string;
}): Evidence {
  const root = opts.root || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const entries = opts.transcriptPath ? readJsonl(opts.transcriptPath) : [];
  const finalMessage = opts.finalMessageOverride || lastAssistantText(entries);
  const tf = toolFiles(entries);
  return {
    sessionId: null,
    finalMessage,
    diff: gitDiffInfo(root),
    scope: { filesRead: entries.length ? tf.read : null, filesEdited: tf.edited },
    spend: entries.length ? sessionCost(entries, loadPrices()) : null,
  };
}

export function findLatestTranscript(): string | null {
  try {
    const base = path.join(os.homedir(), ".claude", "projects");
    let best: string | null = null;
    let bestT = 0;
    for (const proj of fs.readdirSync(base)) {
      const dir = path.join(base, proj);
      let files: string[] = [];
      try {
        files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
      } catch {
        continue;
      }
      for (const f of files) {
        const fp = path.join(dir, f);
        const t = fs.statSync(fp).mtimeMs;
        if (t > bestT) {
          bestT = t;
          best = fp;
        }
      }
    }
    return best;
  } catch {
    return null;
  }
}
