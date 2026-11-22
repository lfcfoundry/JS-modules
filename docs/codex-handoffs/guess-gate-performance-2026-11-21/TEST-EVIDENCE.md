# Test and experiment evidence: guess-gate

## Baseline

Revision: c4c6b3a2ec6bce937b6017c427ff23c4e996cff2.

Command: node modules/guess-gate/test/run.js

Result: all 7 checks passed. No production files were changed.

## Fused-timestamp candidate

Scratch copy: /data/data/com.termux/files/usr/tmp/guess-gate-fused-profile-2026-11-21.

- Candidate command: node test/run.js.
- Result: all 7 existing checks passed.
- The candidate removes one clock read only when run() is allowed. It does not change the skipped path's clock-read count.
- Existing fake-clock cases cover budget share, minMs, nextIn, throw accounting, start reset, and option validation. Add explicit clock-call counts and near-boundary tests before integration.

## Node microbenchmark

Host: Android ARM64, Node v26.13.1. Current and fused candidates used the same monotonic performance.now wrapper, one reusable callback, warmup, and alternating measurement order.

- Dense case: share 1, minMs 0; each run() succeeded. 250,000 calls per measurement, 13 inner measured rounds in each batch, 13 alternating batches. Current median batch 44.408 ms; fused 32.323 ms; 1.374x.
- Skipped case: minMs far in the future, so every run() was rejected. 250,000 calls per measurement. Current 15.387 ms; fused 15.243 ms; 1.009x, within noise.

At this rate, the dense-case reduction is about 48 ns per call. The experiment measures gate overhead alone and does not show a useful user-facing gain.

## Progressive-import model

10,000 simulated imports, 40 chunks each. A fake clock advances 4 ms per parse chunk, guess-gate share is 5%, minMs is 40 ms, and each allowed guess advances it by 4 ms. Eleven measured batches followed two warmups.

- Both implementations ran 20,000 guesses and recorded 80,000 ms total fake guess time.
- Current wall time: median 9.052 ms per 10,000 simulated imports.
- Fused candidate: median 9.085 ms.
- The model showed no gain; its calls are mostly skipped and object creation dominates this tiny workload.

These are Node-only synthetic results. The 4 ms parse/guess values are simulated-clock values, not CPU work performed during the timer.

## Browser tests not run

The current approved matrix, as read on 2026-11-21, is Firefox 158.0, ungoogled Chromium 156.0.8078.79-1, and WebKitGTK 2.52.6 on Linux x86_64, one at a time. This Android ARM64 host cannot qualify those browser builds. Reread the private knowledge-base browsers branch before future runs.