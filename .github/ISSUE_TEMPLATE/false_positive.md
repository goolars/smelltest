---
name: False positive
about: smelltest flagged honest, real work
title: "[false-positive] "
labels: false-positive
---

A false positive is the failure mode this project takes most seriously — the eval is gated at **0
FP** precisely so honest work isn't flagged. Thank you for reporting one.

**The finding that fired**
Which code (`done.no_substance`, `tests.tampered`, `scope.blind_edit`) and the message.

**Why it's a false positive**
What real, substantive work the diff actually contains that the gate missed.

**The diff it misjudged**
```
<paste git diff --unified=0 — redact freely>
```

**Language / framework**
(So we can check the line classifier or test-tamper idioms for that ecosystem.)

---

**Immediate unblock** (so you're not stuck while we fix it): add the code to `disabledCodes` in your
repo's `.smelltest/config.json`, or run `smelltest disarm`. Even armed, the bound means it allows
after at most `maxRevisions` blocks — it can't trap you.

```jsonc
{ "disabledCodes": ["done.no_substance"] }
```

If you can, a minimal `negative` (false-positive bait) case for `eval/corpus/cases.json` that
reproduces it is the ideal PR — it turns your report into a permanent regression guard.
