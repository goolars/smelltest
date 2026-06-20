// smelltest-autonomous — the in-process PreToolUse guard. It runs in the HOST process, not
// the agent's context, so the agent cannot edit or disarm it (unlike the .smelltest/ files
// in plugin mode). Unattended, it DENIES irreversible commands outright (there is no human
// to "ask"). Reuses the destructive patterns from smelltest's config. Fail-open on error.
//
// NOTE (verify on deploy): the PreToolUse callback input/return shapes follow the documented
// SDK hook API (tool_name, tool_input; permissionDecision 'deny'). Confirm field names against
// your installed @anthropic-ai/claude-agent-sdk version — they have shifted across releases.

export function makeGuards(cfg) {
  const patterns = (cfg && cfg.destructive && cfg.destructive.patterns) || [];

  const preToolUse = async (input) => {
    try {
      const name = input.tool_name || input.toolName;
      if (name !== 'Bash') return {};
      const ti = input.tool_input || input.toolInput || {};
      const cmd = String(ti.command || ti.script || '');
      if (!cmd.trim()) return {};
      const hit = patterns.find((p) => { try { return new RegExp(p, 'i').test(cmd); } catch { return false; } });
      if (hit) {
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: `smelltest-autonomous: blocked an irreversible command (matched /${hit}/i) — no human is present to confirm in unattended mode.`,
          },
        };
      }
      return {};
    } catch {
      return {}; // fail-open: never crash the loop on a guard error
    }
  };

  return { PreToolUse: [{ hooks: [preToolUse] }] };
}
