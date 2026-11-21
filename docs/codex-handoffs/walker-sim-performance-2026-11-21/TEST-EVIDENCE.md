# Test and experiment evidence: walker-sim

## Repository baseline

Source revision: c4c6b3a2ec6bce937b6017c427ff23c4e996cff2.

- node modules/walker-sim/test/run.js — all passed against source.
- node modules/walker-sim/test/run.js modules/walker-sim/walker-sim.min.js — all passed against the current minified bundle.
- The repository worktree was clean; production files were not modified.

## Scratch candidate checks

Candidate copy: /data/data/com.termux/files/usr/tmp/lfcfoundry-image-walker-review-2026-11-21/walker-sim-sparse-trials.

- Candidate scratch suite: all passed.
- Differential comparison: 36 checks across K=1, 8, 32, 64, 128, and 200; fixed/softmax/uniform-related configurations; chunked runs; snapshots; exports; split trial ranges; and merges. Tested output statistics matched.
- The comparison did not cover the entire cross-product of eligibility boundaries, graph topologies, snapshot frequency, and JS/Wasm activation. Expand those before landing.
- A separate deterministic-single-edge experiment was also tried, but results were mixed and small: approximately 3% JS and 19% Wasm improvement on one 8,192-node graph branching every 64 nodes, neutral or slower on other shapes. It is not recommended as the first implementation target.

## Main synthetic benchmark

Host: Android ARM64, Node v26.13.1, V8 14.6. Paired alternating rounds; medians reported. Graph: one source with K equally weighted absorbing leaves, exactly one fixed walker each trial.

20,000 trial benchmark, 21 paired rounds:

| K | Current | Candidate | Speedup |
|---:|---:|---:|---:|
| 1 | 4.225 ms | 3.974 ms | 1.06x |
| 8 | 5.067 ms | 3.575 ms | 1.42x |
| 32 | 10.265 ms | 3.765 ms | 2.73x |
| 64 | 17.386 ms | 3.913 ms | 4.44x |
| 128 | 33.725 ms | 3.953 ms | 8.53x |
| 200 | 54.638 ms | 5.634 ms | 9.70x |

At this trial count, the current default did not reach its 20,000-walker Wasm attachment threshold.

100,000 trial benchmark with one final snapshot, 13 paired rounds, first three discarded:

| K | Current default | Candidate | Speedup |
|---:|---:|---:|---:|
| 32 | 77.29 ms | 28.26 ms | 2.73x |
| 128 | 237.70 ms | 26.48 ms | 8.98x |
| 200 | 400.11 ms | 38.28 ms | 10.45x |

For K=128 and 200, current with Wasm explicitly disabled was similar to current default, while still much slower than sparse bookkeeping. This reduces concern that the high-K result is only due to comparing against an anomalous Wasm run.

## Wasm boundary probe

100,000 fixed-one-walker trials, current default (Wasm eligible) versus candidate (Wasm disabled by the prototype):

- One endpoint, 16-node chain: 40.97 ms versus 40.69 ms.
- One endpoint, 64-node chain: 80.53 ms versus 82.55 ms.
- One endpoint, 256-node chain: 258.40 ms versus 276.54 ms.

The candidate was about 7% slower on the 256-node chain. This is a small synthetic host-specific probe, but sufficient to reject a universal switch to JavaScript without more work.

## Browser qualification not run

The host is Android ARM64, outside the current approved Linux x86_64 browser policy. No Firefox, Chromium, or WebKitGTK browser numbers are claimed. Reread the private knowledge-base browsers branch before qualification. Current recorded matrix on 2026-11-21: Firefox 158.0, ungoogled Chromium 156.0.8078.79-1, and WebKitGTK 2.52.6; run one browser at a time.

## Measurement limits

- Synthetic graphs emphasize endpoint-bookkeeping costs; they do not represent every user graph.
- Most run timings used one final snapshot. Snapshotting after every short batch can change the crossover.
- Reported values have no cross-engine confidence interval and should not be used as product claims.
- Candidate disables Wasm in its sparse path; a Wasm-preserving design remains untested.