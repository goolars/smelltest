// smelltest-autonomous — configuration. Every default is tuned for EFFICIENCY and a small
// blast radius. Override via env. The hard money/time bounds are the real safety; the agent
// cannot change them because they live here in the host process, not in files it can edit.

export const CONFIG = {
  // Cheaper model + balanced effort by default — autonomy should not mean "burn opus".
  model: process.env.SMELLTEST_MODEL || 'claude-sonnet-4-6',
  effort: process.env.SMELLTEST_EFFORT || 'medium',

  // dontAsk = headless-safe: pre-approved tools run, everything else is hard-denied.
  // No canUseTool round-trips => fewer turns => cheaper. (Confirmed in SDK permission docs.)
  permissionMode: process.env.SMELLTEST_PERMISSION_MODE || 'dontAsk',
  allowedTools: (process.env.SMELLTEST_ALLOWED_TOOLS || 'Read,Edit,Write,Glob,Grep,Bash').split(',').map((s) => s.trim()).filter(Boolean),
  disallowedTools: (process.env.SMELLTEST_DISALLOWED_TOOLS || '').split(',').map((s) => s.trim()).filter(Boolean),

  // --- The walls (in priority order of trust) ---
  maxBudgetUsd: Number(process.env.SMELLTEST_MAX_USD || 2),       // SDK hard stop -> error_max_budget_usd
  maxTurns: Number(process.env.SMELLTEST_MAX_TURNS || 40),        // SDK hard stop -> error_max_turns
  maxRevisions: Number(process.env.SMELLTEST_MAX_REVISIONS || 3), // app-owned reiterate cap
  deadlineMs: Number(process.env.SMELLTEST_DEADLINE_MS || 10 * 60 * 1000), // external wall-clock kill the agent cannot reach

  // The REAL "done" gate (correctness). Without it there is NO truth check — only honesty.
  verifyCmd: process.env.SMELLTEST_VERIFY_CMD || '',              // e.g. "npm test --silent"

  // undefined => auto-detect from TTY. '1'/'0' to force.
  attended: process.env.SMELLTEST_ATTENDED === undefined ? undefined : process.env.SMELLTEST_ATTENDED === '1',
};

export function isAttended() {
  if (CONFIG.attended !== undefined) return CONFIG.attended;
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}
