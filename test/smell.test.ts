// smelltest — test suite. Run: node --test (Node strips the TS types).
// Exact code-set equality (so over-firing is visible), the corpus, the claim/substance units,
// and the ledger halt-proof kept verbatim — the loop is proven bounded by EXECUTION.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';

import { smell } from '../src/kernel.ts';
import { DEFAULTS } from '../src/config.ts';
import { extractClaims, segmentSentences } from '../src/claims.ts';
import { isSubstantiveLine } from '../src/substance.ts';
import * as ledger from '../src/ledger.ts';
import type { Evidence } from '../src/types.ts';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const corpus = JSON.parse(fs.readFileSync(path.join(here, '..', 'eval', 'corpus', 'cases.json'), 'utf8'));

test('corpus: exact rung + code-set for every case', () => {
  for (const c of corpus.cases) {
    const v = smell(c.evidence as Evidence, DEFAULTS);
    assert.equal(v.rung, c.expect.rung, `${c.name}: rung`);
    const got = [...new Set(v.codes)].sort();
    const want = [...(c.expect.codes || [])].sort();
    assert.deepEqual(got, want, `${c.name}: exact codes (got ${got.join(',')} want ${want.join(',')})`);
    for (const code of c.expect.notCheckedIncludes || []) {
      assert.ok(v.notChecked.some((n) => n.code === code), `${c.name}: expected notChecked ${code}`);
    }
  }
});

test('kernel never certifies "verified"', () => {
  for (const c of corpus.cases) assert.equal(smell(c.evidence as Evidence, DEFAULTS).verifiedCheckmark, false);
});

test('claims: clause-scoped negation does not over-cancel', () => {
  const cfg = DEFAULTS;
  // negator in clause 1 must NOT cancel the claim in clause 2
  const c = extractClaims('I broke nothing, and the parser is implemented.', cfg).filter((x) => !x.negated);
  assert.ok(c.some((x) => x.kind === 'implemented'), 'implemented survives a negator in a different clause');
  // negator in the SAME clause cancels
  const c2 = extractClaims('This is not done yet.', cfg).filter((x) => !x.negated);
  assert.equal(c2.length, 0, 'same-clause negation cancels the claim');
});

test('claims: abbreviation/decimal guard keeps the trailing claim', () => {
  const s1 = segmentSentences('See e.g. the RFC. Implemented the validator.');
  assert.ok(s1.some((s) => /^Implemented/.test(s)), 'the "Implemented" sentence survives the e.g. boundary');
  const s2 = segmentSentences('Bumped to v1.2. Done.');
  assert.ok(s2.join(' ').includes('Done'), 'the decimal boundary does not drop "Done"');
});

test('substance: line classifier separates real code from filler', () => {
  const js = ['//', '/*', '*'];
  assert.equal(isSubstantiveLine('return tokens.map(normalize);', js), true);
  assert.equal(isSubstantiveLine('// handle the case', js), false);
  assert.equal(isSubstantiveLine('   }', js), false);
  assert.equal(isSubstantiveLine("import { z } from './z';", js), false);
  assert.equal(isSubstantiveLine('// TODO: implement', js), false);
  assert.equal(isSubstantiveLine('pass', ['#']), false);
});

test('ledger: per-session revision counter (verbatim behavior)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smelltest-'));
  ledger.append(root, DEFAULTS, { event: 'block', sessionId: 'S1', codes: ['done.no_substance'] });
  ledger.append(root, DEFAULTS, { event: 'pass', sessionId: 'S1', codes: [] });
  ledger.append(root, DEFAULTS, { event: 'block', sessionId: 'S1', codes: ['tests.tampered'] });
  ledger.append(root, DEFAULTS, { event: 'block', sessionId: 'S2', codes: ['done.no_substance'] });
  assert.equal(ledger.revisionCount(root, DEFAULTS, 'S1'), 2);
  assert.equal(ledger.revisionCount(root, DEFAULTS, 'S2'), 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('ledger: the bound actually halts (executing halt-proof)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smelltest-'));
  let blocks = 0;
  for (let turn = 0; turn < 10; turn++) {
    if (ledger.revisionCount(root, DEFAULTS, 'S') >= DEFAULTS.bounds.maxRevisions) break; // gate would ALLOW here
    ledger.append(root, DEFAULTS, { event: 'block', sessionId: 'S', codes: ['done.no_substance'] });
    blocks++;
  }
  assert.equal(blocks, DEFAULTS.bounds.maxRevisions, 'blocks cap at maxRevisions — the loop cannot run away');
  fs.rmSync(root, { recursive: true, force: true });
});

test('ledger: oscillation guard + session-independent ceiling', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smelltest-'));
  ledger.append(root, DEFAULTS, { event: 'block', sessionId: 'S', codes: ['done.no_substance'] });
  assert.equal(ledger.isOscillating(root, DEFAULTS, 'S', ['done.no_substance']), true);
  assert.equal(ledger.isOscillating(root, DEFAULTS, 'S', ['tests.tampered']), false);
  assert.equal(ledger.recentBlockCount(root, DEFAULTS, 12), 1);
  fs.rmSync(root, { recursive: true, force: true });
});
