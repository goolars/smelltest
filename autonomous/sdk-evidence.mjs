// smelltest-autonomous — build the kernel's evidence object from SDK stream data + git.
// The SDK gives us the final assistant text and the tool_use blocks; we read the diff from
// git. Same evidence shape the smelltest kernel already consumes, so smell() is reused as-is.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function extractUrls(text) {
  const urls = (String(text || '').match(/https?:\/\/[^\s)\]}"'>]+/g) || []).map((u) => u.replace(/[.,;]+$/, ''));
  return [...new Set(urls)].map((u) => ({ url: u }));
}

function isTodoOnly(src) {
  const lines = String(src).split('\n').map((l) => l.trim()).filter((l) => l && !/^(\/\/|#|\*|\/\*|<!--|--)/.test(l));
  if (!lines.length) return false;
  return lines.every((l) => /^(todo|fixme|pass|\.\.\.|placeholder|raise notimplementederror|throw new error\(['"]not implemented)/i.test(l));
}

function gitInfo(root) {
  const run = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try { run(['rev-parse', '--is-inside-work-tree']); } catch { return { available: false, isEmpty: null, filesTouched: [], touchedBodies: {} }; }
  let touched = [];
  try {
    touched = run(['status', '--porcelain']).split('\n').filter(Boolean)
      .map((l) => l.slice(3).trim()).filter(Boolean)
      .filter((p) => !/^\.smelltest(\/|$)/.test(p.replace(/\\/g, '/')) && !/^\.git(\/|$)/.test(p.replace(/\\/g, '/')));
  } catch { /* empty */ }
  const bodies = {};
  for (const rel of touched.slice(0, 50)) {
    try { const abs = path.join(root, rel); if (fs.existsSync(abs) && fs.statSync(abs).isFile()) bodies[rel] = { todoOnly: isTodoOnly(fs.readFileSync(abs, 'utf8')) }; } catch { /* skip */ }
  }
  return { available: true, isEmpty: touched.length === 0, filesTouched: touched, touchedBodies: bodies };
}

export function buildSdkEvidence({ finalText, filesRead, filesEdited, filesRequested, root }) {
  return {
    finalMessage: finalText || '',
    citations: extractUrls(finalText || ''),
    diff: gitInfo(root || process.cwd()),
    scope: {
      filesRequested: filesRequested || [],
      filesRead: filesRead || [],
      filesEdited: filesEdited || [],
    },
  };
}

// Accumulate Read/Edit/Write targets from streamed tool_use blocks.
export function trackTool(collected, block) {
  const fp = block.input && (block.input.file_path || block.input.path || block.input.notebook_path);
  if (!fp) return;
  if (block.name === 'Read' || block.name === 'NotebookRead') collected.filesRead.push(fp);
  if (block.name === 'Edit' || block.name === 'Write' || block.name === 'NotebookEdit') collected.filesEdited.push(fp);
}
