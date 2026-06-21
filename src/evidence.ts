// smelltest — build the Evidence object from the transcript + git. The diff is now parsed
// into hunks (git diff --unified=0) so the kernel derives substantive-line facts itself
// instead of trusting an upstream boolean. Best-effort + fail-soft: whatever can't be
// determined is left so the kernel records a notChecked gap, never a false pass.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import type { Evidence, DiffHunk, DiffInfo } from './types.ts';

function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}
function isOurs(p: string): boolean {
  const s = p.replace(/\\/g, '/');
  return /^\.smelltest(\/|$)/.test(s) || /^\.git(\/|$)/.test(s);
}

function parseUnifiedDiff(text: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let cur: DiffHunk | null = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git')) {
      const m = / b\/(.+)$/.exec(line);
      cur = { file: m ? m[1] : '', addedLines: [], removedLines: [] };
      hunks.push(cur);
    } else if (!cur) {
      continue;
    } else if (line.startsWith('+++') || line.startsWith('---')) {
      continue;
    } else if (line.startsWith('+')) {
      cur.addedLines.push(line.slice(1));
    } else if (line.startsWith('-')) {
      cur.removedLines.push(line.slice(1));
    }
  }
  return hunks;
}

export function gitDiffInfo(root: string): DiffInfo {
  try { git(root, ['rev-parse', '--is-inside-work-tree']); }
  catch { return { available: false, isEmpty: true, filesTouched: [], hunks: [] }; }

  const touched: string[] = [];
  const untracked: string[] = [];
  try {
    for (const l of git(root, ['status', '--porcelain']).split('\n').filter(Boolean)) {
      const status = l.slice(0, 2);
      const file = l.slice(3).trim();
      if (!file || isOurs(file)) continue;
      touched.push(file);
      if (status.includes('?')) untracked.push(file);
    }
  } catch { /* leave empty */ }

  const hunks: DiffHunk[] = [];
  try {
    hunks.push(...parseUnifiedDiff(git(root, ['diff', '--unified=0'])));
    hunks.push(...parseUnifiedDiff(git(root, ['diff', '--unified=0', '--cached'])));
  } catch { /* leave empty */ }

  for (const f of untracked) {
    try {
      const abs = path.join(root, f);
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        hunks.push({ file: f, addedLines: fs.readFileSync(abs, 'utf8').split('\n'), removedLines: [] });
      }
    } catch { /* skip */ }
  }

  const clean = hunks.filter((h) => h.file && !isOurs(h.file));
  return { available: true, isEmpty: touched.length === 0, filesTouched: touched, hunks: clean };
}

function readJsonl(file: string): Record<string, unknown>[] {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((x): x is Record<string, unknown> => x !== null);
  } catch { return []; }
}
function blocksOf(entry: any): any[] {
  const m = entry && entry.message ? entry.message : entry;
  const c = m && m.content;
  if (Array.isArray(c)) return c;
  if (typeof c === 'string') return [{ type: 'text', text: c }];
  return [];
}
function roleOf(entry: any): string {
  return (entry && (entry.role || (entry.message && entry.message.role) || entry.type)) || '';
}
function lastAssistantText(entries: any[]): string {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (String(roleOf(entries[i])).includes('assistant')) {
      const txt = blocksOf(entries[i]).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (txt) return txt;
    }
  }
  return '';
}
function toolFiles(entries: any[]): { read: string[]; edited: string[] } {
  const read: string[] = []; const edited: string[] = [];
  const readNames = new Set(['Read', 'NotebookRead']);
  const editNames = new Set(['Edit', 'Write', 'NotebookEdit']);
  for (const e of entries) {
    for (const b of blocksOf(e)) {
      if (b && b.type === 'tool_use') {
        const fp = b.input && (b.input.file_path || b.input.path || b.input.notebook_path);
        if (!fp) continue;
        if (readNames.has(b.name)) read.push(fp);
        if (editNames.has(b.name)) edited.push(fp);
      }
    }
  }
  return { read: [...new Set(read)], edited: [...new Set(edited)] };
}

export function buildEvidence(opts: { transcriptPath?: string | null; root?: string; finalMessageOverride?: string }): Evidence {
  const root = opts.root || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const entries = opts.transcriptPath ? readJsonl(opts.transcriptPath) : [];
  const finalMessage = opts.finalMessageOverride || lastAssistantText(entries);
  const tf = toolFiles(entries);
  return {
    sessionId: null,
    finalMessage,
    diff: gitDiffInfo(root),
    scope: { filesRead: entries.length ? tf.read : null, filesEdited: tf.edited },
  };
}

export function findLatestTranscript(): string | null {
  try {
    const base = path.join(os.homedir(), '.claude', 'projects');
    let best: string | null = null; let bestT = 0;
    for (const proj of fs.readdirSync(base)) {
      const dir = path.join(base, proj);
      let files: string[] = [];
      try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
      for (const f of files) {
        const fp = path.join(dir, f);
        const t = fs.statSync(fp).mtimeMs;
        if (t > bestT) { bestT = t; best = fp; }
      }
    }
    return best;
  } catch { return null; }
}
