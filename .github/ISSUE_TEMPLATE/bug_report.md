---
name: Bug report
about: The gate crashed, hung, blocked when it shouldn't, or didn't fire when it should
title: "[bug] "
labels: bug
---

**What happened**
A clear description. If the gate blocked or warned, paste the emitted JSON / systemMessage.

**Expected**
What you expected instead (allow / warn / block / nothing).

**Repro**
The smaller the better. Ideally:
- the relevant final assistant message (the completion claim), and
- the `git diff --unified=0` it ran against (redact freely).

```
<paste diff / message>
```

**Environment**
- smelltest version (or commit):
- Node version (`node -v`): 
- OS:
- Armed or advisory? (`smelltest status`)

**Gate output** (if you can run it)
```
node --test
node eval/run.ts
```

> Reminder: smelltest fails *open* by design — if it crashed but still allowed the stop, that's the
> intended safety behavior, but the crash is still a bug worth reporting.
