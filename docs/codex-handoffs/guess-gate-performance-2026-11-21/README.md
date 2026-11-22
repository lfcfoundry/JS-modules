# guess-gate performance review

Claude handoff based on JS-modules main at c4c6b3a2ec6bce937b6017c427ff23c4e996cff2 (2026-11-21). This branch contains research documents only; production source and tests are unchanged.

## Read in this order

- FINDINGS.md — current clock-call cost, fused-check candidate, and why no current ship case was found.
- TEST-EVIDENCE.md — baseline and scratch test results, benchmark method, and qualification limits.
- CLAUDE-TASKS.md — targeted validation matrix and a decision gate that allows a no-change conclusion.

## Main finding

A successful GuessGate.run() currently reads the clock three times: for eligibility, callback start, and callback end. A scratch variant reused the eligibility timestamp as the callback start. It passed the existing seven checks and ran 1.37x faster in a synthetic loop of 250,000 successful guesses with a tiny counter callback. It did not improve the common skipped path, and a 40-chunk progressive-import model was effectively unchanged. The default 5% budget was recently tuned in all three approved browsers; keep it as-is.

## Handoff

Validate whether this tiny hot-loop effect appears in actual browser or application workloads. Do not change source, defaults, or version unless the end-to-end gain is measurable and scheduling semantics remain sound.