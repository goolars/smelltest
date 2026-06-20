// smelltest — append-only JSONL ledger + the SELF-OWNED revision counter.
//
// This is the PRIMARY runaway-loop bound, not a secondary one: the Stop gate reads
// the recorded block-count for a session before doing any new work and allows the
// stop once it reaches maxRevisions. Claude Code documents NO built-in cap on
// consecutive Stop-hook blocks and NO stop_hook_active field, so this ledger is the
// only guard that actually exists. Treat it as load-bearing.

import fs from 'node:fs';
import path from 'node:path';

export function ledgerFile(root, cfg) {
  return path.join(root, (cfg && cfg.ledgerPath) || '.smelltest/ledger.jsonl');
}

export function append(root, cfg, entry) {
  try {
    const p = ledgerFile(root, cfg);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
  } catch {
    // A ledger write must never break the gate. Worst case we lose an audit line.
  }
}

export function readEntries(root, cfg) {
  try {
    return fs
      .readFileSync(ledgerFile(root, cfg), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function revisionCount(root, cfg, sessionId) {
  return readEntries(root, cfg).filter((e) => e.sessionId === sessionId && e.event === 'block').length;
}

// Session-INDEPENDENT absolute fuse: how many of the most recent ledger entries are blocks.
// This binds even if session_id semantics ever change (e.g. a new id per turn), so the
// runaway guarantee does not lean on session_id being stable-per-turn.
export function recentBlockCount(root, cfg, window) {
  const all = readEntries(root, cfg);
  return all.slice(-Math.max(1, window || 12)).filter((e) => e.event === 'block').length;
}

export function lastBlock(root, cfg, sessionId) {
  const blocks = readEntries(root, cfg).filter((e) => e.sessionId === sessionId && e.event === 'block');
  return blocks.length ? blocks[blocks.length - 1] : null;
}

// Oscillation guard: same claim failing the same way twice in a row => stop looping.
export function isOscillating(root, cfg, sessionId, currentCodes) {
  const prev = lastBlock(root, cfg, sessionId);
  if (!prev || !Array.isArray(prev.codes)) return false;
  const a = [...prev.codes].sort().join('|');
  const b = [...currentCodes].sort().join('|');
  return a !== '' && a === b;
}
