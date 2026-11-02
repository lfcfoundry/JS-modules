# Stage 5 feasibility budgets (set before candidate implementation)

Environment for the production timing baseline: Termux on Android ARM64 (`aarch64`), Node v26.13.0, `perf_hooks.performance`, current experimental worktree's production `NetflowPlot.make` and `NetflowScene`. Inputs are prebuilt outside timed calls. Each run used 10 warm-ups and 21 timed builds; report median, MAD, and p90. The p90 shows device/GC noise and is not the latency gate.

| Chart | Rows / x groups | Baseline median ms | MAD ms | Candidate limit |
|---|---:|---:|---:|---:|
| Donut | 32 / 4 | 0.401 | 0.071 | <= 1.20 x baseline (paired runs required) |
| Marimekko | 32 / 4 | 0.255 | 0.010 | <= 1.15 x baseline |
| Donut | 4,096 / 1,000 | 4.490 | 0.333 | <= max(1.10 x baseline, baseline + 2 MAD) |
| Marimekko | 4,096 / 1,000 | 5.268 | 0.253 | <= max(1.10 x baseline, baseline + 2 MAD) |
| Donut | 4,096 / 4 | 3.303 | 0.044 | <= 1.10 x baseline |
| Marimekko | 4,096 / 4 | 3.862 | 0.042 | <= 1.10 x baseline |
| Donut | 50,000 / 1,000 | 41.152 | 0.329 | <= max(1.10 x baseline, baseline + 2 MAD) |
| Marimekko | 50,000 / 1,000 | 49.582 | 0.921 | <= max(1.10 x baseline, baseline + 2 MAD) |
| Donut | 50,000 / 4 | 40.762 | 0.991 | <= max(1.10 x baseline, baseline + 2 MAD) |
| Marimekko | 50,000 / 4 | 49.285 | 1.263 | <= max(1.10 x baseline, baseline + 2 MAD) |

A candidate must also improve the paired full-chart median by at least 20% on at least one 50,000-row case and one 1,000-group case to substantiate the stated aggregation-reuse benefit. No ordinary case may exceed its limit. Cancellation/extreme/non-finite workloads are measured separately; they may not regress more than 10% from their own production baseline except where exact overflow-safe output is intentionally different.

Memory gate: after full GC, chart-retained heap delta <= baseline + 10%; peak RSS high-water delta <= 10% where independently measurable. Because `ru_maxrss` is process-lifetime high-water and cannot isolate one synchronous call, report it as a coarse bound, not exact transient memory. No increase in persistent per-row/cross-redraw storage is allowed. GC pause/count is reported; candidate cannot add repeated major collections on the same run.

Footprint gate: incremental production-like helper/code gzip <= 5% of production netflow-plot gzip (about 1.2 KiB using the earlier 23,633-byte gzip baseline); prototype files are also measured separately, but their full copied chart implementation is not mistaken for incremental production footprint. No dependencies.

Compatibility gate: no BigInt requirement in a BigInt-unavailable Node process; exact limb path must pass the same semantic tests. No actual browser compatibility can be accepted without a browser run. Existing documented tested targets are Firefox 158, ungoogled Chromium 155, and WebKitGTK 2.52.6, not declared minimums.

Rationale / uncertainty: 10% ordinary, 15–20% small, 20% benefit, and 10% memory are explicit feasibility budgets chosen for this experiment, not objective standards. Small Donut's baseline MAD is 17.7% of its median, so the 20% gate is only credible using paired/interleaved runs and repeated confirmation. If this device's variability prevents a stable decision, treat the result as inconclusive, not as a pass. Existing gzip baseline is prior recorded evidence and will be remeasured from source in the prototype report.
