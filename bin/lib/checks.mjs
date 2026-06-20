// smelltest — the deterministic check library.
//
// FAST TIER: model-free AND network-free. These are the ONLY checks allowed to drive
// a blocking verdict, because they recompute the truth from machine-checkable signals
// instead of trusting the model's self-report (which is systematically overconfident).
//
// SLOW TIER: network-touching (citation resolution). Advisory only — it demotes
// confidence, it never hard-blocks, and it is off by default.
//
// Every check takes the evidence object and returns a finding
//   { code, rung: 'block'|'warn', tier: 'fast'|'slow', message, signal }
// or null. Checks never throw on normal "couldn't determine" — they return null and
// the kernel records an explicit notChecked entry.

const FAST = 'fast';
const SLOW = 'slow';

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function firstLexeme(text, lexemes) {
  if (!text) return null;
  const lo = String(text).toLowerCase();
  for (const w of lexemes || []) {
    const re = new RegExp('(^|[^a-z0-9])' + escapeRe(String(w).toLowerCase()) + '($|[^a-z0-9])');
    if (re.test(lo)) return w;
  }
  return null;
}

function norm(p) { return String(p).replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase(); }

// Negation / hedge awareness. We must NOT treat "I have not fixed it yet" or "this is not
// complete" as a completion claim — punishing an honest admission of incompleteness is the
// exact inverse of this tool's purpose.
const NEGATOR = /\b(not|never|cannot|can'?t|couldn'?t|won'?t|wasn'?t|isn'?t|aren'?t|haven'?t|hasn'?t|hadn'?t|didn'?t|don'?t|doesn'?t|unable|incomplete|unfinished|still|yet to|remaining|partial|partially|almost|nearly|need(s)? more|to-?do)\b|n't\b/i;

// A completion claim only counts if it appears in a sentence with NO negator/hedge.
export function completionClaimed(ev, cfg) {
  const text = ev && ev.finalMessage;
  if (!text) return null;
  const sentences = String(text).split(/(?<=[.!?\n;])\s+/);
  for (const s of sentences) {
    const lex = firstLexeme(s, cfg.fastTier.completionLexemes);
    if (lex && !NEGATOR.test(s)) return lex;
  }
  return null;
}

function isTestFile(p) {
  return /(^|[/\\])(tests?|spec|__tests__)([/\\])/i.test(String(p)) || /\.(test|spec)\.[a-z0-9]+$/i.test(String(p)) || /_test\.[a-z0-9]+$/i.test(String(p));
}

// "Done" but the working tree changed nothing this turn => the strongest false-done signal.
export function checkDoneEmptyDiff(ev, cfg) {
  const lex = completionClaimed(ev, cfg);
  if (!lex) return null;
  if (!ev.diff || ev.diff.available === false) return null; // -> notChecked in kernel
  if (ev.diff.isEmpty === true) {
    return {
      code: 'done.empty_diff', rung: 'block', tier: FAST,
      message: `Claimed completion ("${lex}") but the working tree shows no changes this turn.`,
      signal: { lexeme: lex, filesTouched: 0 },
    };
  }
  return null;
}

// "Done" but the only changed file bodies are TODO/placeholder, not an implementation.
export function checkDoneTodoOnly(ev, cfg) {
  const lex = completionClaimed(ev, cfg);
  if (!lex) return null;
  const bodies = (ev.diff && ev.diff.touchedBodies) || {};
  const keys = Object.keys(bodies);
  if (!keys.length) return null;
  const todoOnly = keys.filter((k) => bodies[k] && bodies[k].todoOnly === true);
  if (todoOnly.length && todoOnly.length === keys.length) {
    return {
      code: 'done.todo_only', rung: 'block', tier: FAST,
      message: `Claimed completion ("${lex}") but every changed file body is TODO/placeholder, not an implementation.`,
      signal: { lexeme: lex, files: todoOnly },
    };
  }
  return null;
}

// Touched files outside what the user asked for => scope drift.
export function checkScopeUnrequested(ev, cfg) {
  const req = ev.scope && ev.scope.filesRequested;
  const touched = ev.diff && ev.diff.filesTouched;
  if (!req || !req.length || !touched || !touched.length) return null;
  const reqSet = new Set(req.map(norm));
  const extra = touched.filter((f) => !reqSet.has(norm(f)));
  if (extra.length) {
    return {
      code: 'scope.unrequested_file', rung: 'warn', tier: FAST,
      message: `Touched ${extra.length} file(s) not in the request: ${extra.slice(0, 5).join(', ')}.`,
      signal: { extra },
    };
  }
  return null;
}

// Edited a file that was never read this session => a blind edit.
export function checkBlindEdit(ev, cfg) {
  const edited = ev.scope && ev.scope.filesEdited;
  if (!edited || !edited.length) return null;
  const read = (ev.scope && ev.scope.filesRead) || null;
  if (read === null) return null; // can't determine -> notChecked in kernel
  const readSet = new Set(read.map(norm));
  const blind = edited.filter((f) => !readSet.has(norm(f)));
  if (blind.length) {
    return {
      code: 'scope.blind_edit', rung: 'warn', tier: FAST,
      message: `Edited ${blind.length} file(s) never read this session: ${blind.slice(0, 5).join(', ')}.`,
      signal: { blind },
    };
  }
  return null;
}

// Strong confidence with nothing behind it this turn (no change, no citation).
export function checkNakedConfidence(ev, cfg) {
  const lex = firstLexeme(ev && ev.finalMessage, cfg.fastTier.confidenceLexemes);
  if (!lex) return null;
  const hasCite = ((ev && ev.citations) || []).length > 0;
  const hasDiff = ev.diff && ev.diff.isEmpty === false;
  if (!hasCite && !hasDiff) {
    return {
      code: 'confidence.naked', rung: 'warn', tier: FAST,
      message: `Strong confidence ("${lex}") with no supporting change or citation in this turn.`,
      signal: { lexeme: lex },
    };
  }
  return null;
}

// "Tests pass" claimed but the only files that changed are tests => possible test-gaming.
// WARN only — editing tests to pass is sometimes legitimate, so this is not mechanically
// decidable and must never hard-block.
export function checkTestsGamed(ev, cfg) {
  const text = String((ev && ev.finalMessage) || '');
  const claimsPass = completionClaimed(ev, cfg) || /\btests?\s+(pass|passing|are green|now pass)\b|\bpassing now\b/i.test(text);
  if (!claimsPass) return null;
  const touched = (ev.diff && ev.diff.filesTouched) || [];
  if (!touched.length) return null;
  const tests = touched.filter(isTestFile);
  if (tests.length && tests.length === touched.length) {
    return {
      code: 'tests_gamed', rung: 'warn', tier: FAST,
      message: `Claimed tests pass, but the only changed files are tests (${tests.slice(0, 4).join(', ')}). Verify the implementation changed — not just the tests.`,
      signal: { tests },
    };
  }
  return null;
}

export const FAST_CHECKS = [
  checkDoneEmptyDiff, checkDoneTodoOnly, checkScopeUnrequested, checkBlindEdit, checkNakedConfidence, checkTestsGamed,
];

// ---------------- SLOW TIER (network, advisory, off by default) ----------------

function registrableDomain(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    const parts = h.split('.');
    return parts.slice(-2).join('.');
  } catch { return null; }
}

async function resolves(url, timeoutMs) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs || 4000);
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal });
    clearTimeout(t);
    return res.ok || (res.status >= 200 && res.status < 400);
  } catch { return false; }
}

export async function checkCitations(ev, cfg) {
  const cites = (ev && ev.citations) || [];
  if (!cites.length) return [];
  const out = [];
  const domains = new Set(cites.map((c) => registrableDomain(c.url)).filter(Boolean));
  if (cfg.slowTier.echoSingleDomainWarn && cites.length >= 3 && domains.size === 1) {
    out.push({
      code: 'citation.single_domain', rung: 'warn', tier: SLOW,
      message: `All ${cites.length} citations resolve to one domain (${[...domains][0]}) — echo, not corroboration.`,
      signal: { domains: [...domains] },
    });
  }
  for (const c of cites) {
    if (!c || !c.url) continue;
    const ok = await resolves(c.url, cfg.slowTier.citationResolveTimeoutMs);
    if (!ok) {
      out.push({
        code: 'citation.unresolvable', rung: 'warn', tier: SLOW,
        message: `Cited URL did not resolve: ${c.url}`,
        signal: { url: c.url },
      });
    }
  }
  return out;
}
