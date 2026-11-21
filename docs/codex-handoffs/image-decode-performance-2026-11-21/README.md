# image-decode performance review

Research handoff for Claude, based on JS-modules main at c4c6b3a2ec6bce937b6017c427ff23c4e996cff2 (2026-11-21). This branch contains documents only; no production code or generated bundles were changed.

## Read in this order

- FINDINGS.md — source-path review, candidate, measurements, limits, and recommendation.
- TEST-EVIDENCE.md — exact host, correctness checks, timing and memory observations, and what was not run.
- CLAUDE-TASKS.md — implementation and browser-qualification plan with a reproducible permutation matrix.

## Finding in one paragraph

Large base64 data URLs currently become a JavaScript binary string through atob and then are copied byte by byte into a Uint8Array before Blob creation. A scratch candidate using feature-detected Uint8Array.fromBase64 removes that string and JavaScript copy loop while retaining the old path as fallback. It passed local differential checks and was 2.6–2.8x faster in a Node full-load harness with a fake decoder for 1.4–3.9 MB inputs. This is a candidate only: no approved browser was available on the Android ARM64 host, and no real image decode timing was measured.

## Handoff instruction

Treat the candidate as an experiment, not an approved change. First qualify byte/error equivalence and full-flow behavior on the current approved browsers, then decide whether the source change meets the acceptance criteria in CLAUDE-TASKS.md.