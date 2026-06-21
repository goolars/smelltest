// smelltest — THE FUSE (the headline). Append-only JSONL ledger + the self-owned,
// session-independent runaway-loop bound. Ported 1:1 from the original; behavior identical.
// This is the one feature no claim-grading competitor ships, and it maps to the real scar:
// an uncapped agent loop that burned hundreds of dollars in days. Treat as load-bearing.

import fs from "node:fs";
import path from "node:path";
import type { Config } from "./config.ts";

export interface LedgerEntry {
  ts: string;
  event: string;
  sessionId?: string;
  codes?: string[];
  [k: string]: unknown;
}

export function ledgerFile(root: string, cfg: Config): string {
  return path.join(root, cfg.ledgerPath || ".smelltest/ledger.jsonl");
}

export function append(root: string, cfg: Config, entry: Omit<LedgerEntry, "ts">): void {
  try {
    const p = ledgerFile(root, cfg);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
  } catch {
    // A ledger write must never break the gate.
  }
}

export function readEntries(root: string, cfg: Config): LedgerEntry[] {
  try {
    return fs
      .readFileSync(ledgerFile(root, cfg), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l) as LedgerEntry;
        } catch {
          return null;
        }
      })
      .filter((x): x is LedgerEntry => x !== null);
  } catch {
    return [];
  }
}

// Per-session block count — the primary revision cap.
export function revisionCount(root: string, cfg: Config, sessionId: string): number {
  return readEntries(root, cfg).filter((e) => e.sessionId === sessionId && e.event === "block").length;
}

// Session-INDEPENDENT absolute fuse — binds even if session_id semantics ever change.
export function recentBlockCount(root: string, cfg: Config, window: number): number {
  const all = readEntries(root, cfg);
  return all.slice(-Math.max(1, window || 12)).filter((e) => e.event === "block").length;
}

export function lastBlock(root: string, cfg: Config, sessionId: string): LedgerEntry | null {
  const blocks = readEntries(root, cfg).filter((e) => e.sessionId === sessionId && e.event === "block");
  return blocks.length ? blocks[blocks.length - 1] : null;
}

// Same claim failing the same way twice => stop looping.
export function isOscillating(root: string, cfg: Config, sessionId: string, currentCodes: string[]): boolean {
  const prev = lastBlock(root, cfg, sessionId);
  if (!prev || !Array.isArray(prev.codes)) return false;
  const a = [...prev.codes].sort().join("|");
  const b = [...currentCodes].sort().join("|");
  return a !== "" && a === b;
}
