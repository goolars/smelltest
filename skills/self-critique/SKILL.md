---
name: self-critique
description: Before claiming "done / fixed / tests pass", run smelltest's model-free structural kernel on your own output — re-grading the claim against the actual git diff (substantive added lines, test-tampering) instead of trusting your sense of completion. Use whenever you are about to write "done", "implemented", "fixed", or "tests pass".
---

# Self-critique before you claim "done"

Your sense that it's finished is systematically overconfident. Re-grade the claim against the
structure of what actually changed.

## Run the kernel on yourself

Easiest — let the extractor build the evidence from the transcript + git:

```
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" --latest
```

Or pipe a hand-built evidence object (the diff is parsed into hunks — the kernel counts
substantive added lines itself):

```json
{ "finalMessage": "<your about-to-send message>",
  "diff": { "available": true, "isEmpty": false, "filesTouched": ["src/x.ts"],
            "hunks": [{ "file": "src/x.ts", "addedLines": ["..."], "removedLines": [] }] },
  "scope": { "filesRead": ["src/x.ts"], "filesEdited": ["src/x.ts"] } }
```
`echo '<evidence>' | node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" --stdin`

## Act on the verdict

- **WARN `done.no_substance`** → you claimed completion but the diff added 0 substantive lines
  (comment/stub/import don't count). Make the real change, then re-run.
- **WARN `tests.tampered`** → the diff weakened the test suite under a "tests pass" claim.
  Never edit tests to pass — fix the code.
- **note `scope.blind_edit`** → say it out loud — you edited a file you never read.
- **No flags** → say "structural checks did not flag this", never "verified". A self-graded
  claim never earns a check.
