// smelltest-autonomous — selftest for the SDK-INDEPENDENT glue (guards, evidence, verifier,
// and the kernel wiring). The full SDK loop in agent.mjs needs an API key and real spend, so
// it is NOT exercised here — this proves everything around it. Run: node selftest.mjs
//
// Honesty note: this does not and cannot prove the live agent loop works end to end; it proves
// the deterministic pieces the loop depends on.

import assert from 'node:assert/strict';
import { makeGuards } from './guards.mjs';
import { runVerifier } from './verify.mjs';
import { buildSdkEvidence, trackTool } from './sdk-evidence.mjs';
import { smell } from '../bin/smell.mjs';
import { loadConfig } from '../bin/lib/config.mjs';

const cfg = loadConfig(new URL('..', import.meta.url).pathname);
let pass = 0;
const ok = (name, cond) => { assert.ok(cond, name); console.log('  ok -', name); pass++; };

// 1) Guard denies destructive, allows safe.
const guard = makeGuards(cfg).PreToolUse[0].hooks[0];
const denied = await guard({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' } });
ok('guard denies rm -rf', denied.hookSpecificOutput && denied.hookSpecificOutput.permissionDecision === 'deny');
const allowed = await guard({ tool_name: 'Bash', tool_input: { command: 'npm test' } });
ok('guard allows npm test', !allowed.hookSpecificOutput);
const nonbash = await guard({ tool_name: 'Read', tool_input: { file_path: 'x' } });
ok('guard ignores non-Bash', !nonbash.hookSpecificOutput);

// 2) Verifier: skipped when no cmd; pass on true; fail on false.
ok('verifier skipped without cmd', runVerifier(process.cwd(), '').skipped === true);
ok('verifier passes on `node -e 0`', runVerifier(process.cwd(), 'node -e "process.exit(0)"').ok === true);
ok('verifier fails on `node -e 1`', runVerifier(process.cwd(), 'node -e "process.exit(1)"').ok === false);

// 3) trackTool buckets reads vs edits.
const collected = { filesRead: [], filesEdited: [] };
trackTool(collected, { name: 'Read', input: { file_path: 'a.js' } });
trackTool(collected, { name: 'Edit', input: { file_path: 'b.js' } });
ok('trackTool buckets read/edit', collected.filesRead[0] === 'a.js' && collected.filesEdited[0] === 'b.js');

// 4) Evidence + kernel: a false-done blocks through the autonomous evidence path.
const ev = buildSdkEvidence({ finalText: 'All done, implemented it.', filesRead: [], filesEdited: [], root: process.cwd() });
ev.diff = { available: true, isEmpty: true, filesTouched: [], touchedBodies: {} }; // force empty for a deterministic assert
ok('false-done blocks via SDK evidence path', smell(ev, cfg).rung === 'block');

console.log(`\nselftest: ${pass} checks passed.`);
