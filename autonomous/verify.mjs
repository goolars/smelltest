// smelltest-autonomous — the OBJECTIVE verifier: the real "done" gate (correctness).
// smelltest only proves the claim is honest; THIS proves the work actually passes. Runs the
// configured command (tests/build/types) and reports ok + tail of output. If no command is
// configured there is NO correctness gate — the harness warns loudly about it.

import { execSync } from 'node:child_process';

export function runVerifier(root, cmd) {
  if (!cmd) {
    return { ok: true, skipped: true, output: 'NO verifier configured (SMELLTEST_VERIFY_CMD empty) — honesty is checked, correctness is NOT. See README "R2".' };
  }
  try {
    const out = execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5 * 60 * 1000 });
    return { ok: true, skipped: false, output: String(out).slice(-4000) };
  } catch (e) {
    const out = String((e.stdout || '') + '\n' + (e.stderr || '')).trim() || (e.message || 'verifier failed');
    return { ok: false, skipped: false, output: out.slice(-4000) };
  }
}
