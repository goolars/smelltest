// smelltest — the ONE shared hook-input reader. Replaces four copy-pasted readStdin promises
// (stop-gate, note-blind-edit, the CLI's raw fs.readFileSync(0), and the old guard). Never
// throws, never hangs.

export interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  agent_type?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

export function readHookInput(): Promise<HookInput> {
  return new Promise((resolve) => {
    let data = "";
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    };
    if (process.stdin.isTTY) return resolve({});
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => {
      data += c;
    });
    process.stdin.on("end", done);
    process.stdin.on("error", () => resolve({}));
    const t = setTimeout(done, 2000);
    if (typeof t.unref === "function") t.unref();
  });
}
