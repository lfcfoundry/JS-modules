# Findings: walker-sim

## Review target

- GitHub main at review time: c4c6b3a2ec6bce937b6017c427ff23c4e996cff2.
- Module version: walker-sim 2.4.2.
- Hot path: modules/walker-sim/walker-sim.js, especially create()/st.run() around lines 380–541, export() around 540, snapshot() around 566, and merge()/add() around 601.
- The implementation already includes per-node lookup tables, a JavaScript fast loop, a Wasm walker, and Wasm exact-solver kernels. This review targets work around the walker loop rather than proposing a replacement engine.

## Hot-path observation

For the common plain single-source path, each trial chooses a walker count and walks it through a lookup-table path or the Wasm kernel. The loop then clears trialCounts for all K endpoints, scans all K endpoints to update counts, sums, share moments, and per-trial histograms, and may scan endpoints again for precision or trace work.

If a trial contains exactly one fixed walker, at most one endpoint can receive a count. Even when K is large, the current bookkeeping does O(K) work per trial to record one positive value and K zeros. For many short trials and many endpoints, this becomes a substantial fraction of total runtime.

## Scratch candidate

Scratch copy: /data/data/com.termux/files/usr/tmp/lfcfoundry-image-walker-review-2026-11-21/walker-sim-sparse-trials.

For a constrained one-arrival fast path, the candidate:

- Leaves zero endpoint perTrial bins implicit and derives their count as trials minus endpoint count when exporting or snapshotting.
- Updates endpoint count, per-trial moments, and bin 1 only for the endpoint reached.
- Clears only the prior endpoint's trial counter.
- Keeps the general path for costs, dwell, non-table rules, multi-source input, and non-single fixed arrivals.
- Disables Wasm on the sparse path in this prototype. That is the main risk and must be revisited.

The candidate's deferred zeros preserve exact output only if materialization is correct across repeated snapshots, exports, add/merge, split runs, early stop, and final capped trial behavior. Local differential tests cover several of these but not every permutation listed in CLAUDE-TASKS.md.

## Performance evidence

Environment: Node v26.13.1, V8 14.6, Android ARM64. Synthetic graphs; paired alternating local runs. The numbers are not browser results.

At 20,000 trials with one fixed walker each, the baseline's Wasm threshold was not reached, so this is effectively the JavaScript path. Median run time:

| Endpoint count K | Current | Sparse candidate | Speedup |
|---:|---:|---:|---:|
| 1 | 4.225 ms | 3.974 ms | 1.06x |
| 8 | 5.067 ms | 3.575 ms | 1.42x |
| 32 | 10.265 ms | 3.765 ms | 2.73x |
| 64 | 17.386 ms | 3.913 ms | 4.44x |
| 128 | 33.725 ms | 3.953 ms | 8.53x |
| 200 | 54.638 ms | 5.634 ms | 9.70x |

At 100,000 trials with a final snapshot included, the default baseline Wasm path and sparse JavaScript candidate measured:

| K | Current default | Sparse candidate | Speedup |
|---:|---:|---:|---:|
| 32 | 77.29 ms | 28.26 ms | 2.73x |
| 128 | 237.70 ms | 26.48 ms | 8.98x |
| 200 | 400.11 ms | 38.28 ms | 10.45x |

At K=128 and K=200, disabling Wasm on the baseline produced similar times to default Wasm, so the high-K gain is not just an unusually slow Wasm comparison. The candidate primarily removes repeated K-wide JavaScript bookkeeping. These runs included one final snapshot, not snapshots after every small UI batch.

## Boundary: long paths with few endpoints

The prototype bypasses Wasm on the sparse path. With 100,000 fixed-one-walker trials on one-endpoint chains:

| Chain nodes | Current default Wasm | Sparse candidate JavaScript | Candidate change |
|---:|---:|---:|---:|
| 16 | 40.97 ms | 40.69 ms | approximately 1% faster |
| 64 | 80.53 ms | 82.55 ms | approximately 2% slower |
| 256 | 258.40 ms | 276.54 ms | approximately 7% slower |

The result shows why K alone is not a safe gate: deep walks can make the Wasm kernel valuable even when there is only one endpoint. More topologies and target engines are needed before choosing an activation rule.

## Output and semantics

The candidate passed the scratch module's full suite and 36 differential checks over endpoint counts through 200, arrival distributions, chunked runs, snapshots, exports, split ranges, and merges. Checked statistics matched exactly for the tested cases. Existing repository source and current minified bundle suites also pass independently.

The optimization must preserve:

- endpoint counts, shares, confidence ranges, per-trial moments and quantiles;
- zero-bin frequency materialization and stable snapshot copies;
- trace values, precision stopping, stuck and walker totals;
- exports, repeated add/merge, split trial ranges, and worker merge semantics;
- deterministic seeded output and the JS/Wasm engine equivalence contract.

## Recommendation

Continue with the sparse-statistics experiment, but test a Wasm-preserving implementation and interactive snapshot cadence before integrating it. Test endpoint counts from 1 through at least 200 across short fanout, balanced branching, skewed branching, and deep-chain graphs. Do not ship a fixed K threshold from one Node architecture.