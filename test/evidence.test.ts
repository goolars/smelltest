// smelltest — verifies extract-evidence against the REAL Claude Code transcript schema.
// Confirmed by reading actual ~/.claude/projects/*.jsonl (June 2026): each turn is split into
// SEPARATE per-block JSONL entries (thinking / text / tool_use are distinct lines, NOT one
// content array), non-message entries like "queue-operation" are interleaved, and Read/Edit/
// Write tool_use blocks carry input.file_path. This fixture locks that contract in so a schema
// drift breaks a test instead of silently no-op-ing the gate in production.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildEvidence } from '../src/evidence.ts';

test('evidence: parses the real per-block transcript schema', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smelltest-'));
  execFileSync('git', ['init', '-q'], { cwd: root });

  const entries = [
    { type: 'queue-operation', operation: 'noop', timestamp: 't' },           // non-message line, must be ignored
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'fix the auth bug' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'reasoning…' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'src/auth.ts' } }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't2', name: 'Edit', input: { file_path: 'src/auth.ts', old_string: 'a', new_string: 'b' } }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't3', name: 'Write', input: { file_path: 'src/new.ts', content: 'x' } }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Done — implemented the fix.' }] } },
  ];
  const tr = path.join(root, 't.jsonl');
  fs.writeFileSync(tr, entries.map((e) => JSON.stringify(e)).join('\n'));

  const ev = buildEvidence({ transcriptPath: tr, root });
  assert.equal(ev.finalMessage, 'Done — implemented the fix.', 'the last text block is the final message');
  assert.ok(ev.scope.filesRead && ev.scope.filesRead.includes('src/auth.ts'), 'Read target captured');
  assert.ok(ev.scope.filesEdited.includes('src/auth.ts'), 'Edit target captured');
  assert.ok(ev.scope.filesEdited.includes('src/new.ts'), 'Write target captured');

  fs.rmSync(root, { recursive: true, force: true });
});
