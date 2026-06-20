#!/usr/bin/env node
// smelltest — THE PERIMETER (PP-12, reckless edits). PostToolUse/Edit|Write. Non-blocking.
//
// Surfaces an edit to a file that was never read this session. It only NOTES (systemMessage
// + ledger) — it never blocks. If it cannot build the read-set, it records a notChecked
// entry rather than implying the edit was clean.

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, projectRoot } from '../bin/lib/config.mjs';
import { buildEvidence } from '../bin/extract-evidence.mjs';
import * as ledger from '../bin/lib/ledger.mjs';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) return resolve({});
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    process.stdin.on('error', () => resolve({}));
    setTimeout(() => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } }, 2000).unref?.();
  });
}

try {
  const input = await readStdin();
  const root = projectRoot(input);
  const cfg = loadConfig();
  const edited = (input.tool_input && (input.tool_input.file_path || input.tool_input.path)) || '';
  if (!edited) process.exit(0);

  const ev = buildEvidence({ transcriptPath: input.transcript_path, root });
  const norm = (p) => String(p).replace(/\\/g, '/').toLowerCase();

  if (ev.scope.filesRead === null) {
    ledger.append(root, cfg, { event: 'notChecked', sessionId: input.session_id, code: 'scope.blind_edit', reason: 'no read-set (no transcript)' });
    process.exit(0);
  }
  const wasRead = new Set(ev.scope.filesRead.map(norm)).has(norm(edited));
  if (!wasRead) {
    ledger.append(root, cfg, { event: 'warn', sessionId: input.session_id, code: 'scope.blind_edit', file: edited });
    console.log(JSON.stringify({ systemMessage: `smelltest: edited a file not read this session — ${path.basename(edited)}. Blind edit; verify it didn't clobber something.` }));
  }
  process.exit(0);
} catch {
  process.exit(0);
}
