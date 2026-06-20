#!/usr/bin/env node
// smelltest-autonomous — a bounded autonomous agent on the Claude Agent SDK.
//
// DESIGN (why it's built this way):
//   * The reiterate loop is OWNED HERE, in host code — NOT in an SDK Stop hook. The SDK's
//     "Stop hook forces continuation" mechanism is undocumented; we don't depend on it. We
//     run query() to completion, grade the result, and (if needed) run again with concrete,
//     machine-derived feedback. Fully bounded, budget-aware, no undocumented behavior.
//   * TWO gates per round: an OBJECTIVE verifier (tests/build) is the real "done" =
//     correctness; smelltest's deterministic kernel is the honesty gate on top. Both must
//     pass. smelltest cannot supply correctness — see README "R2".
//   * The WALLS the agent cannot touch: maxBudgetUsd + maxTurns (SDK), an external wall-clock
//     kill (host), and the in-process PreToolUse destructive-deny. None live in files the
//     agent can edit.
//   * Intake: if a human is present, the kickoff asks clarifying questions via AskUserQuestion;
//     headless, it proceeds on explicitly-stated assumptions. ("ask key questions, or execute.")
//
// This program calls the Claude API at runtime and SPENDS MONEY each run. Deploy it
// deliberately, in an isolated container, with the budget cap. See README.

import fs from 'node:fs';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { smell, renderVerdict } from '../bin/smell.mjs';
import { loadConfig } from '../bin/lib/config.mjs';
import { buildSdkEvidence, trackTool } from './sdk-evidence.mjs';
import { makeGuards } from './guards.mjs';
import { runVerifier } from './verify.mjs';
import { CONFIG, isAttended } from './config.mjs';

const log = (...a) => console.error('[smelltest-autonomous]', ...a);

function kickoffPrompt(task, attended) {
  const tail = attended
    ? 'Before changing anything: if any requirement is ambiguous or blocking, ask concise clarifying questions via AskUserQuestion. If everything is clear, proceed.'
    : 'No human is available. If any requirement is ambiguous, state your assumptions explicitly at the top of your work, then proceed sensibly.';
  return `${task}\n\n${tail}\nWhen you believe you are done, make sure the change is REAL (not a stub) and that the project's checks pass. Do not claim completion you cannot back up.`;
}

function fixPrompt({ verdict, verify }) {
  const parts = ['The task is not yet acceptable. Fix EXACTLY the following, then stop. Do NOT edit tests or weaken your claims to make the checks pass — make the real change.'];
  if (verify && !verify.ok && !verify.skipped) parts.push('OBJECTIVE VERIFIER FAILED — output tail:\n' + verify.output);
  if (verdict && verdict.rung === 'block') parts.push('HONESTY GATE (smelltest) BLOCKED:\n' + verdict.findings.map((f) => `- [${f.code}] ${f.message}`).join('\n'));
  return parts.join('\n\n');
}

function escalate(root, kind, detail) {
  const report = { ts: new Date().toISOString(), kind, ...detail };
  try {
    const dir = path.join(root, '.smelltest');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'autonomous-report.jsonl'), JSON.stringify(report) + '\n');
  } catch { /* ignore */ }
  log(`ESCALATION [${kind}]`, JSON.stringify(detail));
}

export async function runAutonomous({ task, root = process.cwd(), options = {} }) {
  const cfg = loadConfig(path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'));
  const budgetUsd = options.maxBudgetUsd ?? CONFIG.maxBudgetUsd;
  const maxTurns = options.maxTurns ?? CONFIG.maxTurns;
  const maxRevisions = options.maxRevisions ?? CONFIG.maxRevisions;
  const deadlineMs = options.deadlineMs ?? CONFIG.deadlineMs;
  const attended = options.attended ?? isAttended();
  const allowedTools = attended ? [...CONFIG.allowedTools, 'AskUserQuestion'] : CONFIG.allowedTools;

  if (!CONFIG.verifyCmd) log('WARNING: no SMELLTEST_VERIFY_CMD set — correctness is NOT gated, only honesty. See README R2.');

  // External wall the agent cannot reach.
  const killer = setTimeout(() => { escalate(root, 'deadline', { deadlineMs }); process.exit(2); }, deadlineMs);
  killer.unref?.();

  let spent = 0;
  let sessionId = null;
  let prompt = kickoffPrompt(task, attended);
  let verdict = null;
  let verify = null;

  for (let rev = 0; rev <= maxRevisions; rev++) {
    const collected = { finalText: '', filesRead: [], filesEdited: [], cost: 0, subtype: null, stopReason: null };
    const q = query({
      prompt,
      options: {
        model: CONFIG.model,
        effort: CONFIG.effort,
        permissionMode: CONFIG.permissionMode,
        allowedTools,
        disallowedTools: CONFIG.disallowedTools,
        settingSources: ['project'],                       // load CLAUDE.md (durable rules survive compaction)
        maxTurns,
        maxBudgetUsd: Math.max(0.01, budgetUsd - spent),   // remaining budget for this round
        hooks: makeGuards(cfg),                            // in-process destructive deny
        ...(sessionId ? { resume: sessionId } : {}),       // continue the same session across revisions
      },
    });

    for await (const m of q) {
      if (m.type === 'assistant') {
        for (const b of (m.message && m.message.content) || []) {
          if (b.type === 'text') collected.finalText = b.text;
          if (b.type === 'tool_use') trackTool(collected, b);
        }
      } else if (m.type === 'result') {
        // Defensive: the SDK uses camelCase for option INPUTS but the ResultMessage OUTPUT
        // casing is ambiguous in the docs (snake_case likely). Read both so cost tracking and
        // termination handling work regardless of the installed SDK version's convention.
        collected.cost = m.total_cost_usd ?? m.totalCostUsd ?? 0;
        collected.subtype = m.subtype;
        collected.stopReason = m.stop_reason ?? m.stopReason ?? null;
        sessionId = m.session_id ?? m.sessionId ?? sessionId;
      }
    }
    spent += collected.cost || 0;
    log(`round ${rev}: subtype=${collected.subtype} stop=${collected.stopReason} spent=$${spent.toFixed(4)}`);

    // SDK hard-stop / error terminal states.
    if (collected.subtype === 'error_max_budget_usd' || collected.subtype === 'error_max_turns') {
      escalate(root, 'cap', { subtype: collected.subtype, spent, rev });
      clearTimeout(killer); return { status: 'halted_cap', subtype: collected.subtype, spent };
    }
    if (collected.subtype && collected.subtype !== 'success') {
      escalate(root, 'error', { subtype: collected.subtype, stopReason: collected.stopReason, spent, rev });
      clearTimeout(killer); return { status: 'error', subtype: collected.subtype, spent };
    }
    if (collected.stopReason === 'refusal') {
      escalate(root, 'refusal', { spent, rev });
      clearTimeout(killer); return { status: 'refused', spent };
    }

    // Gate 1: correctness (objective). Gate 2: honesty (smelltest).
    verify = runVerifier(root, CONFIG.verifyCmd);
    const ev = buildSdkEvidence({ finalText: collected.finalText, filesRead: collected.filesRead, filesEdited: collected.filesEdited, root });
    verdict = smell(ev, cfg);
    log('verifier:', verify.ok ? 'PASS' : (verify.skipped ? 'SKIPPED' : 'FAIL'), '| smelltest:', verdict.rung);

    const correct = !CONFIG.verifyCmd ? false : verify.ok; // no verifier => never "correct enough" to auto-accept
    const honest = verdict.rung !== 'block';

    if (correct && honest) {
      clearTimeout(killer);
      return { status: 'done', spent, revisions: rev, verdict: renderVerdict(verdict), verify: verify.ok };
    }
    if (!CONFIG.verifyCmd && honest) {
      // No objective gate: we will NOT silently auto-accept. Escalate for human review.
      escalate(root, 'needs_review_no_verifier', { spent, rev, verdict: verdict.rung });
      clearTimeout(killer);
      return { status: 'needs_human_review', reason: 'honest but no objective verifier configured', spent };
    }
    if (spent >= budgetUsd) {
      escalate(root, 'budget', { spent, rev });
      clearTimeout(killer); return { status: 'halted_budget', spent };
    }

    prompt = fixPrompt({ verdict, verify });
  }

  escalate(root, 'max_revisions', { spent, verdict: verdict && verdict.rung, verifyOk: verify && verify.ok });
  clearTimeout(killer);
  return { status: 'halted_revisions', spent, revisions: maxRevisions };
}

// CLI: node autonomous/agent.mjs "your task"   (task also accepted on stdin)
if (process.argv[1] && process.argv[1].endsWith('agent.mjs')) {
  const task = process.argv.slice(2).join(' ').trim() || (process.stdin.isTTY ? '' : fs.readFileSync(0, 'utf8').trim());
  if (!task) { log('Usage: node autonomous/agent.mjs "<task>"'); process.exit(1); }
  runAutonomous({ task })
    .then((r) => { log('RESULT', JSON.stringify(r, null, 2)); process.exit(r.status === 'done' ? 0 : 1); })
    .catch((e) => { log('FATAL', e && e.stack || e); process.exit(1); });
}
