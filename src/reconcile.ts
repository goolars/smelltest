// smelltest — Layer 3: reconcile each claim against the structural facts. Replaces the old
// single global completionClaimed() that drove every check identically. Severity is DISCRETE
// and justified by WHICH structural fact fired — not an uncalibrated 0-100 float.

import type { Claim, Evidence, Finding, NotChecked } from './types.ts';
import type { Config } from './config.ts';
import { classifyDiff, detectTestTamper } from './substance.ts';
import { activeClaims } from './claims.ts';

export interface Reconciliation { findings: Finding[]; notChecked: NotChecked[]; }

export function reconcile(claims: Claim[], ev: Evidence, cfg: Config): Reconciliation {
  const findings: Finding[] = [];
  const notChecked: NotChecked[] = [];
  const active = activeClaims(claims);
  const implFix = active.find((c) => c.kind === 'implemented' || c.kind === 'fixed');
  const hasTested = active.some((c) => c.kind === 'tested');
  const hasRemoved = active.some((c) => c.kind === 'removed');

  if (implFix && (!ev.diff || ev.diff.available === false)) {
    notChecked.push({ code: 'done.no_substance', reason: 'no git/diff context to verify the completion claim' });
  }

  if (ev.diff && ev.diff.available !== false) {
    const sub = classifyDiff(ev.diff, cfg);

    if (implFix && sub.classifiedFiles.length === 0 && sub.unsupportedFiles.length > 0) {
      // Only touched files we cannot classify -> a gap, never a silent pass.
      notChecked.push({ code: 'done.no_substance', reason: `changed only unsupported-language file(s): ${sub.unsupportedFiles.slice(0, 4).join(', ')}` });
    } else if (implFix && sub.substantiveAddedLines === 0 && !hasRemoved) {
      // Merges the old done.empty_diff + done.todo_only. Catches empty diffs AND
      // comment/stub/import-only diffs claimed as real work. WARN, never a hard block in v1.
      findings.push({
        code: 'done.no_substance',
        severity: 'warn',
        message: `Claimed completion ("${implFix.lexeme}") but the diff added 0 substantive lines (non-blank, non-comment, non-import, non-stub).`,
        signal: { substantiveAddedLines: 0, filesTouched: ev.diff.filesTouched.length, classified: sub.classifiedFiles },
      });
    }

    if (hasTested) {
      const tamper = detectTestTamper(ev.diff, cfg);
      if (tamper.tampered) {
        findings.push({
          code: 'tests.tampered',
          severity: 'warn',
          message: `Claimed tests pass while the diff weakened the suite: ${tamper.signals.slice(0, 3).join('; ')}.`,
          signal: { signals: tamper.signals },
        });
      }
    }
  }

  if (ev.scope && ev.scope.filesEdited && ev.scope.filesEdited.length) {
    if (ev.scope.filesRead == null) {
      notChecked.push({ code: 'scope.blind_edit', reason: 'no read-set available for this session' });
    } else {
      const read = new Set(ev.scope.filesRead.map((p) => p.replace(/\\/g, '/').toLowerCase()));
      const blind = ev.scope.filesEdited.filter((f) => !read.has(f.replace(/\\/g, '/').toLowerCase()));
      if (blind.length) {
        findings.push({ code: 'scope.blind_edit', severity: 'advisory', message: `Edited ${blind.length} file(s) never read this session: ${blind.slice(0, 4).join(', ')}.`, signal: { blind } });
      }
    }
  }

  return { findings, notChecked };
}
