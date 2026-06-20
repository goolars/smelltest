---
name: self-critique
description: Before claiming a task is done/verified/fixed or citing a source, assemble a machine-checkable evidence object and run smelltest's model-free kernel on your own output — catching false completion, scope drift, blind edits, and naked confidence BEFORE you say "done". Use whenever you are about to write "done", "complete", "implemented", "fixed", "verified", "tests pass", or include a source URL.
---

# Self-critique before you claim "done"

You are about to claim completion, verification, or cite a source. Do not trust your own
sense that it's finished — that sense is systematically overconfident. Re-grade yourself
with code first.

## Run the kernel on yourself

1. Gather machine facts (do not rely on memory):
   - your final claim text;
   - `git status --porcelain` (what actually changed);
   - the files you actually opened with Read this session;
   - the files the user asked you to change.
2. Build an evidence object:
   ```json
   {
     "finalMessage": "<your about-to-send message>",
     "diff": { "available": true, "isEmpty": <true|false>, "filesTouched": [..], "touchedBodies": {} },
     "scope": { "filesRequested": [..], "filesRead": [..], "filesEdited": [..] },
     "citations": [{ "url": "..." }]
   }
   ```
3. Pipe it through the kernel:
   `echo '<evidence json>' | node "${CLAUDE_PLUGIN_ROOT}/bin/smell-cli.mjs" --stdin`
   (Or, if a transcript is available, just `node "${CLAUDE_PLUGIN_ROOT}/bin/smell-cli.mjs" --latest`.)

## Act on the verdict

- **BLOCK** → you have not actually finished. Fix the real gap (implement the empty/TODO
  body, make the change the diff is missing). Then re-run. **Never** edit tests or soften the
  claim to make the verdict pass — that is the exact dishonesty this exists to stop.
- **WARN** → state the caveat out loud (the scope drift, the blind edit, the lone-domain
  citation) instead of hiding it.
- **No flags** → say "checks did not flag this" — never "verified". A self-graded claim
  never earns a ✓.

For consequential work, also dispatch the **smell-critic** subagent to adversarially refute
your claims before you send.
