// smelltest — Layer 2: structural detection over the actual diff (PURE BUILT-INS, no AST/WASM).
// This is the part that replaces "trust an upstream isEmpty/todoOnly boolean" with facts
// computed from the unified diff. It is strictly stronger than the old lexeme theater and
// catches "changed only a comment and said done" and "weakened one assertion while editing
// one impl line" — the exact cases the old all-or-nothing checks missed. Honest ceiling:
// counting substantive added lines is a heuristic an agent can pad around; that is why the
// findings it drives are WARN, never a hard block, until a false-positive rate is published.

import type { Config } from "./config.ts";
import type { DiffInfo } from "./types.ts";

function extOf(file: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(file.replace(/\\/g, "/"));
  return m ? m[1].toLowerCase() : "";
}

const STUB = /^(todo|fixme)\b|^(pass|\.\.\.|placeholder|noqa)\s*$|not[\s_]*implemented|notimplementederror/i;
const IMPORT_ONLY =
  /^(import\b|export\s+\{|export\s+\*|from\s+['"]|#include\b|using\s+\w|const\s+\w+\s*=\s*require\()/;
const PUNCT_ONLY = /^[\s{}()[\];,.:<>+|&]*$/;

function isComment(trimmed: string, prefixes: string[]): boolean {
  return prefixes.some((p) => trimmed.startsWith(p));
}

export function isSubstantiveLine(line: string, prefixes: string[]): boolean {
  const t = line.trim();
  if (!t) return false;
  if (PUNCT_ONLY.test(t)) return false; // lone braces / brackets / operators
  if (isComment(t, prefixes)) return false;
  if (IMPORT_ONLY.test(t)) return false;
  if (STUB.test(t)) return false; // TODO / pass / "not implemented" stubs
  return true;
}

export interface SubstanceResult {
  substantiveAddedLines: number;
  unsupportedFiles: string[];
  classifiedFiles: string[];
}

export function classifyDiff(diff: DiffInfo, cfg: Config): SubstanceResult {
  let substantive = 0;
  const unsupported: string[] = [];
  const classified: string[] = [];
  for (const h of diff.hunks || []) {
    if (h.binary || h.combined) continue; // binary = its own bucket (not a parse failure); combined handled as notChecked
    const prefixes = cfg.commentPrefixes[extOf(h.file)];
    if (!prefixes) {
      unsupported.push(h.file);
      continue;
    } // never silently count as 0
    classified.push(h.file);
    for (const line of h.addedLines) if (isSubstantiveLine(line, prefixes)) substantive++;
  }
  return { substantiveAddedLines: substantive, unsupportedFiles: unsupported, classifiedFiles: classified };
}

export interface TamperResult {
  tampered: boolean;
  signals: string[];
  testFiles: string[];
}

// Line-level test-tamper detection (no AST needed for skip/delete/literal patterns). Fires
// EVEN WHEN a non-test source file also changed — the case the old tests.length===touched.length
// check could not see.
export function detectTestTamper(diff: DiffInfo, cfg: Config): TamperResult {
  const testRe = new RegExp(cfg.testFilePattern, "i");
  const skipRe = new RegExp(cfg.skipMarkers.join("|"), "i");
  const assertRe = new RegExp(cfg.assertionMarkers.join("|"), "i");
  const signals: string[] = [];
  const testFiles: string[] = [];

  for (const h of diff.hunks || []) {
    // Whole-test-file DELETION is the strongest tamper signal — independent of assertion counting.
    if (h.deleted && testRe.test(h.oldPath || h.file)) {
      const p = h.oldPath || h.file;
      signals.push(`deleted test file ${p}`);
      if (!testFiles.includes(p)) testFiles.push(p);
      continue;
    }
    // Test RENAMED out of the test path (dodges the suite without touching assertions).
    if (h.renamedFrom && testRe.test(h.renamedFrom) && !testRe.test(h.file)) {
      signals.push(`test file renamed out of the test path: ${h.renamedFrom} -> ${h.file}`);
      continue;
    }
    if (h.binary || h.combined) continue;
    if (!testRe.test(h.file)) continue;
    if (!testFiles.includes(h.file)) testFiles.push(h.file);
    const removedAsserts = h.removedLines.filter((l) => assertRe.test(l)).length;
    const addedAsserts = h.addedLines.filter((l) => assertRe.test(l)).length;
    const addedSkips = h.addedLines.filter((l) => skipRe.test(l)).length;
    if (removedAsserts > addedAsserts)
      signals.push(`net -${removedAsserts - addedAsserts} assertion(s) in ${h.file}`);
    if (addedSkips > 0) signals.push(`added ${addedSkips} skip/only marker(s) in ${h.file}`);
  }
  return { tampered: signals.length > 0, signals, testFiles };
}
