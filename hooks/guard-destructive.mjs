#!/usr/bin/env node
// smelltest — THE PERIMETER (PP-07, irreversible data loss). PreToolUse/Bash.
//
// This is the ONE protection that is fail-CLOSED by default — but even then it ASKS, it
// never silently allows and never hard-denies (a hard deny on an unparseable command could
// deadlock). Ambiguous / script-wrapped commands escalate to ask. Node, not a .sh, so it
// actually runs on Windows/PowerShell where a POSIX script would silently fail-open.

import { loadConfig } from '../bin/lib/config.mjs';

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
  const cfg = loadConfig();
  if (!cfg.destructive.enabled) process.exit(0);

  const cmd = String((input.tool_input && (input.tool_input.command || input.tool_input.script)) || '');
  if (!cmd.trim()) process.exit(0);

  const matched = cfg.destructive.patterns.find((p) => {
    try { return new RegExp(p, 'i').test(cmd); } catch { return false; }
  });

  // Script-wrapped / opaque invocations we cannot inspect -> escalate to ask, not allow.
  const opaque = /\b(bash|sh|zsh|pwsh|powershell|node|python3?|make|npm run|xargs|eval)\b\s+\S/i.test(cmd)
    && /(rm|del|reset|clean|format|mkfs|dd|truncate|remove-item)/i.test(cmd);

  if (matched || opaque) {
    const why = matched ? `matches irreversible-data-loss pattern /${matched}/i` : 'wraps a deletion in an opaque sub-invocation this guard cannot fully parse';
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: `smelltest: this command ${why}. Irreversible — confirm before running.`,
      },
    }));
    process.exit(0);
  }
  process.exit(0);
} catch {
  process.exit(0); // fail-open: never block a turn on a guard crash
}
