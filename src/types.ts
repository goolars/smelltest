// smelltest — single source of truth for the engine's shapes.
// Erasable types only (Node strips them at runtime; no enums/namespaces).

export type ClaimKind = "implemented" | "fixed" | "tested" | "removed" | "refactored";

// v1 emits only 'warn' and 'advisory'. 'block' is reserved for v2, once a
// false-positive rate is published for a check (see README / SMOKE-TEST.md).
export type Severity = "block" | "warn" | "advisory";

export interface Claim {
  kind: ClaimKind;
  lexeme: string;
  negated: boolean;
  sentence: string;
}

export interface DiffHunk {
  file: string; // post-image path, from the authoritative '+++ ' / 'rename to' line
  addedLines: string[]; // content of '+' lines (header lines excluded)
  removedLines: string[]; // content of '-' lines
  binary?: boolean; // Binary files / GIT binary patch — never counts as substance
  deleted?: boolean; // +++ /dev/null or 'deleted file mode'
  renamedFrom?: string; // 'rename from' source path
  oldPath?: string; // pre-image path (for deletions/renames)
  combined?: boolean; // diff --cc / @@@ merge diff — body skipped, recorded as notChecked
}

export interface DiffInfo {
  available: boolean; // false when there is no git context
  isEmpty: boolean; // true when nothing changed this turn
  filesTouched: string[];
  hunks: DiffHunk[]; // raw added/removed lines; the kernel derives facts from these
}

export interface Scope {
  filesRead: string[] | null; // null => unknown (recorded as notChecked, never a silent pass)
  filesEdited: string[];
}

export interface Evidence {
  sessionId?: string | null;
  finalMessage: string;
  diff: DiffInfo;
  scope: Scope;
}

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  signal?: Record<string, unknown>;
}

export interface NotChecked {
  code: string;
  reason: string;
}

export interface Verdict {
  rung: "block" | "warn" | "pass";
  findings: Finding[];
  notChecked: NotChecked[];
  codes: string[];
  verifiedCheckmark: false; // structurally unreachable — a self-graded claim cannot earn a check
}
