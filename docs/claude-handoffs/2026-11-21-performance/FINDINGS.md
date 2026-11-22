# speed-lab findings

## Baseline and previous work

- Reviewed main revision c4c6b3a2ec6bce937b6017c427ff23c4e996cff2.
- Current file is version 1.1.1, API 1.
- The earlier review studied version 1.0.0. Its 34% shorter default run, stalled-page watchdog, insufficient-frame refusal, hidden-page detection, and conditional second measurements landed in 1.1.0. Version 1.1.1 only changed report wording.
- The earlier review's recommended browser tests and 17 ms slowdown detection remain relevant. They are not new changes to implement.

## Current Node evidence

Host: Node v26.13.1, Android, arm64. The test is intentionally wall-clock dominated: a default step waits through 1.1 s warm-up and 2.5 s recording, plus settling and setup.

The post-step stat function was timed with synthetic frame gaps after warm-up:

| Gaps passed to stat | Calls | Total | Time per stat |
|---:|---:|---:|---:|
| 150 | 20,000 | 359.23 ms | 17.96 microseconds |
| 1,000 | 5,000 | 876.56 ms | 175.31 microseconds |
| 10,000 | 300 | 616.77 ms | 2.056 ms |

A normal 2.5 s step at 60 Hz produces about 150 gaps. Its statistics take about 18 microseconds after the timed recording has completed. Replacing the copy-and-sort in stat would not shorten the measured step or reduce per-frame work.

Node qualification passed: node tools/speed-lab/test/run.js, 12 of 12 checks.

## What is and is not measured here

This host is not one of the approved desktop browser environments. No browser timing, real rAF callback overhead, refresh-rate behavior, or phone result is claimed. Existing README browser results are historical results, not a re-run for this review.

The browser-sensitive work is frames(): it records one timestamp delta per callback and the optional PerformanceObserver collects Long Animation Frame entries where supported. Any proposed instrumentation change must be measured on a real browser page because the instrumentation runs inside the thing being measured.

## Source pointers

- tools/speed-lab/speed-lab.js: stat() and verdict() near the top.
- tools/speed-lab/speed-lab.js: run(), frames(), visibility tracking, and PerformanceObserver around lines 105-175.
- tools/speed-lab/test/run.js: current 12 Node checks.
- Browser integration is in tests/pieces-browser.js, not the Node test file.

## Finding

No code change is justified by this profile. The default test time is governed by its chosen observation window. The statistics pass is negligible at the normal sample count. The only plausible low-level target is per-rAF instrumentation cost, which this Node run cannot measure and which must not change the verdict inputs.
