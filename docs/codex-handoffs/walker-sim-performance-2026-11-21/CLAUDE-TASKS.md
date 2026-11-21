# Claude task plan: walker-sim

## Objective

Validate and, if worthwhile, implement exact sparse endpoint bookkeeping for one fixed walker per trial while preserving seeded results, statistics, merge/export behavior, and the fastest available JS or Wasm execution path.

## 1. Rebase and inspect

- Start from current GitHub main and inspect later walker-sim changes relative to c4c6b3a2ec6bce937b6017c427ff23c4e996cff2.
- Read module instructions, tests, versioning workflow, Wasm build instructions, and current approved-browser policy.
- Inspect walker-sim.js, walker-sim-wasm.c or equivalent source, generated Wasm/JS loaders, worker integration, minified output, and prior walker-sim research.
- Preserve source-of-truth workflow. Never patch generated/minified files directly. Use the pinned compiler/build steps and record compiler version and flags.

## 2. Explore designs before choosing one

Benchmark at least these designs:

A. Current implementation unchanged.
B. Scratch design that keeps zero endpoint bins implicit and updates only the reached endpoint, with JavaScript walker.
C. Sparse bookkeeping while retaining the Wasm walker. Consider returning or otherwise tracking the single trial's reached endpoint from the Wasm kernel so JavaScript does not rescan K bins.
D. A hybrid with an experimentally chosen eligibility rule that retains Wasm for deep walks or small K.
E. Optional: deterministic one-outgoing-edge RNG shortcut only if isolated profiles show it matters after A–D.

Do not assume endpoint count alone predicts the best engine. Do not combine candidates until each has an isolated result.

## 3. Correctness and boundary matrix

For every eligible candidate, compare exact seeded outputs to current code:

- K = 1, 2, 4, 8, 16, 24, 32, 64, 128, 200.
- One-hop star/fanout; balanced trees; skewed probabilities; branching graphs with endpoint leaves at different depths; one-endpoint chains of 16, 64, 256, and 8,192 nodes; and chains branching every 4, 16, and 64 nodes.
- Fixed one arrival, default arrival, fixed two or more, softmax, and uniform distributions; partial final trial at maxWalkers; zero/one maxWalkers boundaries.
- One source versus multiple sources; plain table path versus first/curious rules; costs and dwell enabled/disabled.
- wasm enabled/disabled; default wasmAfter and explicit values that force JS-only or Wasm transition.
- One large run versus many small run(maxTrials, budgetMs) calls; snapshot after each batch versus final-only snapshot.
- precision stopping on/off and several precision thresholds.
- snapshot repeated before and after more work; export repeated; add and merge; split trial ranges with different merge order; worker-style structured clone.

Compare all observable output: endpoints, perTrial mean/sd/quantiles, share intervals, traces, steps, visits, moves, stuck totals, engine choice, exports, and stop behavior. For zero-bin compression, specifically verify materialization is idempotent and never mutates an earlier snapshot/export.

## 4. Profile the crossover

Use a deterministic benchmark with graph construction outside timed regions, prebuilt equivalent configurations, warmup, alternating order, at least 20 measured pairs, and exact output validation. Report median, p95, and spread; repeat each key case in fresh processes where practical.

For each graph permutation above, record:

- K, node/edge count, mean and p95 path length, endpoint probability distribution, trials, walkers, and whether any trial is capped;
- JS-only, current default, and candidate Wasm behavior, including the actual engine used;
- total run time, time per trial/walker/edge, bytes allocated if measurable, and time spent in snapshot/export;
- snapshot cadence: final-only, every 1,000 trials, every 100 trials, and every 10 trials;
- initial run cost, transition point around wasmAfter, and total time after enough work to amortize Wasm setup.

Repeat on the currently approved Firefox 158.0, ungoogled Chromium 156.0.8078.79-1, and WebKitGTK 2.52.6 Linux x86_64 policy as freshly confirmed from the private knowledge-base branch. Run one browser at a time. Do not reuse these version numbers without rereading the current policy.

## 5. Decision gate and implementation

Integrate only if:

- Exact functional equivalence passes across the supported mode boundaries.
- A Wasm-preserving sparse design or a justified hybrid improves representative high-K workloads, including repeated UI snapshots.
- No repeatable regression above 5% appears in the defined low-K/deep-path workloads or ordinary module fixtures.
- The rule selecting sparse/JS/Wasm is supported by results in at least two approved browsers and does not add fragile graph-specific heuristics.

If a universal rule cannot meet that gate, keep the feature scoped to the narrow configurations with a proven win or leave the prototype unmerged and report results.

On success: update source and tests only, rebuild Wasm and generated bundles using repository tools, run source/minified/Wasm suites and all qualification, then update changelog/version through the module workflow.

## 6. Handoff back

Commit implementation and evidence on a separate Claude/Codex branch. Include exact commands, benchmark harness or reproducible fixtures, browser versions, test outputs, topology matrix, engine transition points, final thresholds, and an explanation of any untested cells.