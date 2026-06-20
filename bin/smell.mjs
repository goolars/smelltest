// smelltest — THE KERNEL. Zero dependency.
//
// smell(evidence, config) -> verdict   is a PURE function over a machine-checkable
// evidence object, using ONLY the fast (model-free, network-free) checks. This is the
// blocking path. It NEVER emits a "verified" checkmark, because a verdict produced with
// no human in the loop cannot earn one — it can only fail to find a problem.
//
// smellSlow(evidence, config) -> findings[]   runs the network/advisory tier separately.

import { FAST_CHECKS, completionClaimed, checkCitations } from './lib/checks.mjs';

export function smell(ev, cfg) {
  ev = ev || {};
  const findings = [];
  const notChecked = [];

  for (const fn of FAST_CHECKS) {
    try {
      const r = fn(ev, cfg);
      if (r) findings.push(r);
    } catch (e) {
      notChecked.push({ code: fn.name, reason: String((e && e.message) || e) });
    }
  }

  // Make the gaps explicit — a signal we COULD NOT check is recorded, never silently passed.
  if (completionClaimed(ev, cfg) && (!ev.diff || ev.diff.available === false)) {
    notChecked.push({ code: 'done.empty_diff', reason: 'no git/diff context to verify completion claim' });
  } else if (completionClaimed(ev, cfg) && ev.diff && ev.diff.available !== false && typeof ev.diff.isEmpty !== 'boolean') {
    notChecked.push({ code: 'done.empty_diff', reason: 'diff context present but isEmpty was not determined' });
  }
  if (ev.scope && ev.scope.filesEdited && ev.scope.filesEdited.length && (!ev.scope.filesRead && ev.scope.filesRead !== [])) {
    if (ev.scope.filesRead == null) notChecked.push({ code: 'scope.blind_edit', reason: 'no read-set available for this session' });
  }

  const block = findings.some((f) => f.rung === 'block');
  const warn = findings.some((f) => f.rung === 'warn');
  const rung = block ? 'block' : warn ? 'warn' : 'pass';

  return {
    rung,
    findings,
    notChecked,
    codes: findings.map((f) => f.code),
    verifiedCheckmark: false, // structurally unreachable from the deterministic path
  };
}

export async function smellSlow(ev, cfg) {
  if (!cfg || !cfg.slowTier || !cfg.slowTier.enabled) return [];
  try {
    return await checkCitations(ev || {}, cfg);
  } catch {
    return [];
  }
}

// Render a verdict as a compact, honest report. Legend makes "warn/?" read as rigor.
export function renderVerdict(verdict, opts = {}) {
  const slow = opts.slowFindings || [];
  const all = [...verdict.findings, ...slow];
  const icon = (r) => (r === 'block' ? '⛔ BLOCK' : r === 'warn' ? '⚠ WARN' : '·');
  const lines = [];
  lines.push(`smelltest verdict: ${verdict.rung.toUpperCase()}  (this gate never certifies "verified" — it can only fail to find a problem)`);
  if (!all.length) {
    lines.push('  · nothing flagged by the deterministic checks.');
  } else {
    for (const f of all) lines.push(`  ${icon(f.rung)}  [${f.code}] ${f.message}`);
  }
  if (verdict.notChecked.length) {
    lines.push('  notChecked (gaps, recorded — not a pass):');
    for (const n of verdict.notChecked) lines.push(`    ? [${n.code}] ${n.reason}`);
  }
  return lines.join('\n');
}
