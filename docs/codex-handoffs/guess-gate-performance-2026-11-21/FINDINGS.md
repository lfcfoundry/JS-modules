# Findings: guess-gate

## Review target

- Main revision: c4c6b3a2ec6bce937b6017c427ff23c4e996cff2.
- Module version: guess-gate 1.0.1.
- Hot code: modules/guess-gate/guess-gate.js, especially allowed(), nextIn(), and run() around lines 21–32.
- The module is already small and its recent 1.0.1 default-share change was measured in Chromium 156, Firefox 158, and WebKitGTK 2.52.6. That work reduced the default from 10% to 5% after the 10% setting slowed WebKitGTK imports.

## Code-path observation

run(fn, estimateMs) calls allowed(), which takes one clock reading. When allowed, run() immediately takes another reading to start timing fn, then a third reading in finally to measure it. A skipped call takes one clock reading. Eligibility already uses a timestamp immediately before the callback, so the second reading can be reused as the start timestamp.

Scratch candidate changes allowed(est) into a predicate that accepts a timestamp. run() takes one timestamp, uses it for the eligibility test and callback timing, and keeps the final clock read. This reduces successful calls from three reads to two. It still takes one clock reading for every skipped call.

The candidate's timestamp is slightly earlier than the old callback-start timestamp. The measured cost therefore includes the small eligibility-check work, conservatively charging that overhead to optional work. Check near-threshold scheduling and error behavior before considering a change.

## Measurements

Host: Android ARM64, Node v26.13.1. Timings are module-only Node experiments, not browser or application results.

| Workload | Current | Fused candidate | Result |
|---|---:|---:|---:|
| 250,000 successful no-op run() calls, share 1, minMs 0 | 44.408 ms | 32.323 ms | 1.374x faster |
| 250,000 skipped run() calls, minMs far in the future | 15.387 ms | 15.243 ms | 1.009x; within noise |

The dense success case saves about 48 ns per call on this host. It intentionally maximizes the candidate's opportunity and is unlike the module's expected use, where guesses are optional and many calls are skipped.

A README-shaped deterministic model used 10,000 imports, 40 chunks per import, 4 ms parse per chunk, a 5% share, 40 ms minimum, and a 4 ms guess cost. Both variants ran exactly 20,000 guesses total (two per import) and recorded 80,000 ms fake spent time. Across 11 measured batches, current took 9.052 ms and candidate 9.085 ms overall. There was no measured end-to-end gain in this skip-heavy model.

## Existing evidence and recommendation

The README already reports the important browser result for the default budget: 5% keeps the simulated import within noise of no guesses in Chromium 156, Firefox 158, and WebKitGTK 2.52.6; 10% was too costly in WebKitGTK. Do not repeat or revise that default from this Node microbenchmark.

No meaningful practical performance breakthrough was found for guess-gate. A fused clock read is a possible tiny implementation simplification for unusually high successful-call rates, but it has a timing-accounting nuance and no gain in the current import model. The recommended result is no source change unless Claude finds an actual consumer where many run() calls succeed and this gate overhead is measurable in the full timeline.

No approved-browser tests were run here; the host is Android ARM64.