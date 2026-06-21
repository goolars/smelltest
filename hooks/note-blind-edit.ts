// smelltest — PostToolUse note: edited a file never read this session. Non-blocking,
// low-severity advisory. Records a notChecked entry when the read-set is unavailable.

import path from "node:path";
import { loadConfig, projectRoot } from "../src/config.ts";
import { buildEvidence } from "../src/evidence.ts";
import * as ledger from "../src/ledger.ts";
import { readHookInput } from "../src/stdin.ts";

async function main(): Promise<void> {
  const input = await readHookInput();
  try {
    const root = projectRoot(input);
    const cfg = loadConfig();
    const ti = input.tool_input || {};
    const edited = String((ti.file_path as string) || (ti.path as string) || "");
    if (!edited) return;
    const ev = buildEvidence({ transcriptPath: input.transcript_path, root });
    const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase();
    if (ev.scope.filesRead == null) {
      ledger.append(root, cfg, {
        event: "notChecked",
        sessionId: input.session_id,
        code: "scope.blind_edit",
        reason: "no read-set",
      });
      return;
    }
    if (!new Set(ev.scope.filesRead.map(norm)).has(norm(edited))) {
      ledger.append(root, cfg, {
        event: "advisory",
        sessionId: input.session_id,
        code: "scope.blind_edit",
        file: edited,
      });
      console.log(
        JSON.stringify({
          systemMessage: `smelltest: edited a file not read this session — ${path.basename(edited)}.`,
        }),
      );
    }
  } catch {
    /* fail-open */
  }
}
void main();
