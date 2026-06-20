// smelltest — its own test suite. Run: node --test
//
// This is the dogfood: the loop is proven bounded by EXECUTION here, not merely asserted
// by design. The corpus cases pin the kernel's verdicts; the ledger tests prove the
// self-owned revision bound and the oscillation guard actually stop.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';

import { smell, renderVerdict } from '../bin/smell.mjs';
import { DEFAULTS } from '../bin/lib/config.mjs';
import * as ledger from '../bin/lib/ledger.mjs';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const corpus = JSON.parse(fs.readFileSync(path.join(here, '..', 'eval', 'corpus', 'cases.json'), 'utf8'));

test('corpus: kernel produces the required verdict for every planted case', () => {
  for (const c of corpus.cases) {
    const v = smell(c.evidence, DEFAULTS);
    assert.equal(v.rung, c.expect.rung, `${c.name}: rung`);
    for (const code of c.expect.codes || []) {
      assert.ok(v.codes.includes(code), `${c.name}: expected finding ${code}, got [${v.codes.join(', ')}]`);
    }
    for (const code of c.expect.notCheckedIncludes || []) {
      assert.ok(v.notChecked.some((n) => n.code === code), `${c.name}: expected notChecked ${code}`);
    }
  }
});

test('kernel never emits a verified checkmark and renderVerdict never prints one', () => {
  for (const c of corpus.cases) {
    const v = smell(c.evidence, DEFAULTS);
    assert.equal(v.verifiedCheckmark, false, `${c.name}: verifiedCheckmark must be false`);
    assert.ok(!renderVerdict(v).includes('✓'), `${c.name}: render must not contain a check mark`);
  }
});

test('ledger: self-owned revision counter counts blocks per session', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smelltest-'));
  const cfg = DEFAULTS;
  assert.equal(ledger.revisionCount(root, cfg, 'S1'), 0);
  ledger.append(root, cfg, { event: 'block', sessionId: 'S1', codes: ['done.empty_diff'] });
  ledger.append(root, cfg, { event: 'pass', sessionId: 'S1', codes: [] });
  ledger.append(root, cfg, { event: 'block', sessionId: 'S1', codes: ['done.todo_only'] });
  ledger.append(root, cfg, { event: 'block', sessionId: 'S2', codes: ['done.empty_diff'] });
  assert.equal(ledger.revisionCount(root, cfg, 'S1'), 2, 'two blocks for S1');
  assert.equal(ledger.revisionCount(root, cfg, 'S2'), 1, 'one block for S2');
  fs.rmSync(root, { recursive: true, force: true });
});

test('ledger: the bound actually halts (count reaches maxRevisions)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smelltest-'));
  const cfg = DEFAULTS;
  let blocks = 0;
  for (let turn = 0; turn < 10; turn++) {
    if (ledger.revisionCount(root, cfg, 'S') >= cfg.bounds.maxRevisions) break; // gate would ALLOW here
    ledger.append(root, cfg, { event: 'block', sessionId: 'S', codes: ['done.empty_diff'] });
    blocks++;
  }
  assert.equal(blocks, cfg.bounds.maxRevisions, 'blocks capped at maxRevisions, loop cannot run away');
  fs.rmSync(root, { recursive: true, force: true });
});

test('ledger: oscillation guard fires on identical repeated failure', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smelltest-'));
  const cfg = DEFAULTS;
  ledger.append(root, cfg, { event: 'block', sessionId: 'S', codes: ['done.empty_diff'] });
  assert.equal(ledger.isOscillating(root, cfg, 'S', ['done.empty_diff']), true, 'same codes => oscillating');
  assert.equal(ledger.isOscillating(root, cfg, 'S', ['scope.blind_edit']), false, 'different codes => not oscillating');
  fs.rmSync(root, { recursive: true, force: true });
});
