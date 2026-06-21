// smelltest — the Stop / SubagentStop gate. ADVISORY BY DEFAULT: inert unless armed.
// The DECISION lives in the pure src/gate.ts decideStop(); this file does only the I/O —
// read ledger facts + the verdict, decide, then append + emit. Fails open on any error.

import fs from "node:fs";
import path from "node:path";
import { loadConfig, projectRoot } from "../src/config.ts";
import { buildEvidence } from "../src/evidence.ts";
import { decideStop } from "../src/gate.ts";
import { smell } from "../src/kernel.ts";
import * as ledger from "../src/ledger.ts";
import { readHookInput } from "../src/stdin.ts";

async function main(): Promise<void> {
  const input = await readHookInput();
  const allow = (msg?: string) => {
    if (msg) console.log(JSON.stringify({ systemMessage: msg }));
    process.exit(0);
  };
  try {
    const root = projectRoot(input);
    const cfg = loadConfig(undefined, root); // merges this repo's .smelltest/config.json
    if (!fs.existsSync(path.join(root, cfg.armedFlagPath))) process.exit(0); // advisory by default

    if (input.hook_event_name === "SubagentStop" && input.agent_type === "smell-critic") process.exit(0);

    const sessionId = input.session_id || "unknown";
    const ceiling = cfg.bounds.absoluteIterationCeiling ?? 4;
    const state = {
      used: ledger.revisionCount(root, cfg, sessionId),
      recentBlocks: ledger.recentBlockCount(root, cfg, ceiling * 3),
      lastBlockCodes: ledger.lastBlock(root, cfg, sessionId)?.codes ?? null,
    };

    const ev = buildEvidence({ transcriptPath: input.transcript_path, root });
    ev.sessionId = sessionId;
    const verdict = smell(ev, cfg);

    switch (decideStop(state, verdict, cfg)) {
      case "allow_cap":
        ledger.append(root, cfg, {
          event: "allow_cap",
          sessionId,
          used: state.used,
          cap: cfg.bounds.maxRevisions,
        });
        return allow(
          `smelltest: revision cap (${cfg.bounds.maxRevisions}) reached — allowing stop. Audit: .smelltest/ledger.jsonl`,
        );
      case "allow_ceiling":
        ledger.append(root, cfg, { event: "allow_ceiling", sessionId, ceiling });
        return allow(
          `smelltest: absolute block ceiling (${ceiling}) reached — allowing stop (session-independent fuse).`,
        );
      case "allow_oscillation":
        ledger.append(root, cfg, { event: "allow_oscillation", sessionId, codes: verdict.codes });
        return allow("smelltest: same finding as last revision — allowing stop to avoid thrashing.");
      case "allow_pass":
        ledger.append(root, cfg, {
          event: verdict.rung,
          sessionId,
          codes: verdict.codes,
          notChecked: verdict.notChecked.map((n) => n.code),
        });
        return process.exit(0);
      default: {
        // block
        ledger.append(root, cfg, { event: "block", sessionId, codes: verdict.codes });
        const reason = [
          "smelltest blocked this stop — the completion claim is not backed by the diff:",
          ...verdict.findings.map((f) => `  • [${f.code}] ${f.message}`),
          "",
          "Make the REAL change (do not edit tests or soften the claim to pass).",
          `Bounded: blocks at most ${cfg.bounds.maxRevisions}x (used ${state.used + 1}), then allows. Disarm: smelltest disarm.`,
        ].join("\n");
        console.log(JSON.stringify({ decision: "block", reason }));
        return process.exit(0);
      }
    }
  } catch (e) {
    try {
      console.log(
        JSON.stringify({ systemMessage: `smelltest: gate error, failing open (${(e as Error)?.message})` }),
      );
    } catch {
      /* noop */
    }
    process.exit(0);
  }
}
void main();
