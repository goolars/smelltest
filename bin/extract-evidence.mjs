// smelltest — the SINGLE shared evidence extractor.
//
// Both the Stop hook and the /smell command build their evidence object HERE, from the
// transcript + git, so the manual surface has the same integrity as the automated one:
// the kernel is fed machine-read facts, never the model's recollection of its own output.
//
// Everything is best-effort and fail-soft: whatever cannot be determined is left null so
// the kernel records an explicit notChecked entry instead of a false pass.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

function readJsonl(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

function blocksOf(entry) {
  const m = entry && entry.message ? entry.message : entry;
  const c = m && m.content;
  if (Array.isArray(c)) return c;
  if (typeof c === 'string') return [{ type: 'text', text: c }];
  return [];
}
function roleOf(entry) {
  return (entry && (entry.role || (entry.message && entry.message.role) || entry.type)) || '';
}

function lastAssistantText(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (String(roleOf(entries[i])).includes('assistant')) {
      const txt = blocksOf(entries[i]).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (txt) return txt;
    }
  }
  return '';
}

function lastUserText(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (String(roleOf(entries[i])) === 'user' || String(roleOf(entries[i])).includes('user')) {
      const txt = blocksOf(entries[i]).filter((b) => b.type === 'text' || typeof b === 'string')
        .map((b) => (typeof b === 'string' ? b : b.text)).join('\n').trim();
      if (txt) return txt;
    }
  }
  return '';
}

function toolUses(entries) {
  const uses = [];
  for (const e of entries) {
    for (const b of blocksOf(e)) {
      if (b && b.type === 'tool_use') uses.push({ name: b.name, input: b.input || {} });
    }
  }
  return uses;
}

function filePathFrom(input) {
  return input.file_path || input.path || input.notebook_path || null;
}

function extractUrls(text) {
  const urls = (text.match(/https?:\/\/[^\s)\]}"'>]+/g) || []).map((u) => u.replace(/[.,;]+$/, ''));
  return [...new Set(urls)].map((u) => ({ url: u }));
}

function extractRequestedFiles(text) {
  // file-path-ish tokens: contain a slash or a known extension
  const toks = text.match(/[A-Za-z0-9_./\\-]+\.[A-Za-z0-9]{1,6}|[A-Za-z0-9_./-]*\/[A-Za-z0-9_./-]+/g) || [];
  return [...new Set(toks.filter((t) => t.length > 2 && !t.startsWith('http')))];
}

function gitInfo(root) {
  const run = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    run(['rev-parse', '--is-inside-work-tree']);
  } catch {
    return { available: false, isEmpty: null, filesTouched: [], touchedBodies: {} };
  }
  let touched = [];
  try {
    const porcelain = run(['status', '--porcelain']).split('\n').filter(Boolean);
    touched = porcelain
      .map((l) => l.slice(3).trim())
      .filter(Boolean)
      // Exclude smelltest's own runtime state and git internals — they are never the user's work.
      .filter((p) => !/^\.smelltest(\/|$)/.test(p.replace(/\\/g, '/')) && !/^\.git(\/|$)/.test(p.replace(/\\/g, '/')));
  } catch { /* leave empty */ }
  const bodies = {};
  for (const rel of touched.slice(0, 50)) {
    try {
      const abs = path.join(root, rel);
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) bodies[rel] = { todoOnly: isTodoOnly(fs.readFileSync(abs, 'utf8')) };
    } catch { /* skip */ }
  }
  return { available: true, isEmpty: touched.length === 0, filesTouched: touched, touchedBodies: bodies };
}

// Conservative: only true when the file has real lines but every real line is a placeholder.
function isTodoOnly(src) {
  const lines = src.split('\n').map((l) => l.trim())
    .filter((l) => l && !/^(\/\/|#|\*|\/\*|<!--|--)/.test(l));
  if (!lines.length) return false;
  return lines.every((l) => /^(todo|fixme|pass|\.\.\.|placeholder|raise notimplementederror|throw new error\(['"]not implemented)/i.test(l));
}

export function buildEvidence({ transcriptPath, root, finalMessageOverride } = {}) {
  root = root || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const entries = transcriptPath ? readJsonl(transcriptPath) : [];
  const finalMessage = finalMessageOverride || lastAssistantText(entries);
  const userText = lastUserText(entries);
  const uses = toolUses(entries);

  const readNames = new Set(['Read', 'NotebookRead']);
  const editNames = new Set(['Edit', 'Write', 'NotebookEdit']);
  const filesRead = entries.length
    ? [...new Set(uses.filter((u) => readNames.has(u.name)).map((u) => filePathFrom(u.input)).filter(Boolean))]
    : null; // null => unknown => notChecked
  const filesEdited = [...new Set(uses.filter((u) => editNames.has(u.name)).map((u) => filePathFrom(u.input)).filter(Boolean))];

  return {
    sessionId: null,
    finalMessage,
    citations: extractUrls(finalMessage),
    diff: gitInfo(root),
    scope: {
      filesRequested: userText ? extractRequestedFiles(userText) : [],
      filesRead,
      filesEdited,
    },
  };
}

// Convenience for the /smell command: find the newest transcript jsonl.
export function findLatestTranscript() {
  try {
    const base = path.join(os.homedir(), '.claude', 'projects');
    let best = null; let bestT = 0;
    for (const proj of fs.readdirSync(base)) {
      const dir = path.join(base, proj);
      let files = [];
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

// CLI: print the evidence object as JSON.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] && process.argv[1].endsWith('extract-evidence.mjs')) {
  const argv = process.argv.slice(2);
  const get = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
  let tp = get('--transcript');
  if (argv.includes('--latest')) tp = findLatestTranscript();
  const root = get('--root') || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  console.log(JSON.stringify(buildEvidence({ transcriptPath: tp, root }), null, 2));
}
