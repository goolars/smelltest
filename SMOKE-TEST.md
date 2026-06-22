# Pre-ship smoke test (HARD gate)

Every unit test runs against a synthetic `Evidence` object. The real Stop-hook stdin /
transcript contract can only be exercised end-to-end against git + a transcript, so this is a
**required checklist item before any release** — green unit tests do not prove the live
transcript parser produces the evidence the kernel expects.

> ⚠️ **Invariant — keep the transcript OUT of the graded repo.** smelltest grades the *working
> tree* of the project at `cwd`. In production the transcript lives in `~/.claude/projects/…`
> (outside your repo), so this is automatic. For this smoke test, write the transcript and the
> hook input to a **sibling temp dir**, never inside the throwaway repo. If the transcript file
> sits in the graded tree it becomes the only "change", and the gate (correctly) reports a
> `notChecked` gap for an unsupported-extension file instead of the empty-tree block you are
> testing for — which looks like a broken gate but is not.

Set up an empty throwaway repo plus a **sibling** work dir for the inputs. `$PLUGIN` is your
smelltest checkout. (bash — works on macOS/Linux and Windows git-bash.)

```bash
REPO="$(mktemp -d)"                              # empty graded repo (no commits)
git -C "$REPO" init -q
WORK="$(mktemp -d)"                              # sibling dir — NOT inside $REPO
# Windows git-bash: make the paths Node-resolvable (no-op on macOS/Linux):
if command -v cygpath >/dev/null
then
  REPO="$(cygpath -m "$REPO")"
  WORK="$(cygpath -m "$WORK")"
fi

# a transcript whose last assistant message claims completion (lives OUTSIDE the repo):
printf '%s\n' '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"All done — implemented the feature."}]}}' > "$WORK/t.jsonl"

# the Stop-hook stdin, as a real file (avoids printf|node shell-quoting pitfalls):
printf '{"session_id":"S","hook_event_name":"Stop","transcript_path":"%s","cwd":"%s"}' "$WORK/t.jsonl" "$REPO" > "$WORK/input.json"

node "$PLUGIN/src/cli.ts" --root "$REPO" arm     # advisory by default — arm to enforce
```

1. **Block on a false completion.** The transcript claims "done" but the tree is empty:
   ```bash
   CLAUDE_PROJECT_DIR="$REPO" node "$PLUGIN/hooks/stop-gate.ts" < "$WORK/input.json"
   ```
   Expect: `{"decision":"block","reason":"… done.no_substance …"}`.

2. **Allow after the bound.** Repeat the exact same call. On an identical finding the
   oscillation guard fires (with differing findings, the per-session cap does):
   ```bash
   CLAUDE_PROJECT_DIR="$REPO" node "$PLUGIN/hooks/stop-gate.ts" < "$WORK/input.json"
   ```
   Expect a `systemMessage` allowing the stop, and `$REPO/.smelltest/ledger.jsonl` showing
   `block` → `allow_oscillation` / `allow_cap`. The loop must demonstrably halt.

3. **Inert when disarmed.** Disarm, then repeat step 1 — expect exit 0 with no output:
   ```bash
   node "$PLUGIN/src/cli.ts" --root "$REPO" disarm
   CLAUDE_PROJECT_DIR="$REPO" node "$PLUGIN/hooks/stop-gate.ts" < "$WORK/input.json"
   ```

4. **Fail-open.** Feed malformed stdin — expect exit 0, never a hang or a block:
   ```bash
   echo 'not json' | CLAUDE_PROJECT_DIR="$REPO" node "$PLUGIN/hooks/stop-gate.ts"
   ```

Record the run (paste the block reason + the ledger tail) in the release notes. A release
without this evidence is not shippable.

```bash
rm -rf "$REPO" "$WORK"   # cleanup
```

*(If you run the hooks on Node < 22.6, build first — `npm run build` — and invoke
`dist/hooks/stop-gate.mjs` instead of the `.ts`.)*
