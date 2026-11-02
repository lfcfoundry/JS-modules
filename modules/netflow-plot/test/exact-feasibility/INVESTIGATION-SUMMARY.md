# Stage 5 exact aggregation reuse — final decision

**Status: closed; rejected as a production architecture.** Do not integrate the BigInt, limb, or hybrid exact aggregation reuse designs into Netflow Plot, and do not port them to Netflow Map. The prototypes and measurements remain preserved for reference.

## Evidence

See [`BUDGETS.md`](./BUDGETS.md) for the acceptance limits established before candidate benchmarking. The full paired run is preserved in [`full-chart-benchmark.jsonl`](./full-chart-benchmark.jsonl), and its repeatable workload and timing procedure is in [`full-chart-benchmark.js`](./full-chart-benchmark.js). It compared production with BigInt, limb, and hybrid paths for Donut and Marimekko across five row/group shapes and ordinary, cancellation-heavy, extreme-exponent, and non-finite inputs.

The high-cardinality results failed the required performance benefit. On ordinary 50,000-row / 1,000-group workloads, production versus BigInt / limb / hybrid full-build medians were:

| Chart | Production | BigInt | Limb | Hybrid |
|---|---:|---:|---:|---:|
| Donut | 42.465 ms | 50.391 ms | 74.660 ms | 82.738 ms |
| Marimekko | 53.822 ms | 88.941 ms | 174.182 ms | 75.418 ms |

The limb path was the slowest architecture on most large, high-cardinality cases. Some 4,096-row / four-group workloads improved, but those gains did not generalize: several 50,000-row / four-group cases regressed substantially. Across all 40 paired workload/chart cases, the median candidate-to-production latency ratio was 1.29× for BigInt, 3.19× for limb, and 1.32× for hybrid. No candidate met both the ordinary latency limits and the required high-cardinality benefit. Small-chart measurements were noisy; the paired production baseline also varied from the earlier baseline run, so borderline timings are not treated as passes.

Memory probes used separate processes, 50,000 rows / 1,000 groups, ten builds, and forced GC before retained-heap measurement. Relative to production, retained heap increased by:

- Donut: BigInt +24%, limb +44%, hybrid +24%.
- Marimekko: BigInt +18%, limb +34%, hybrid +18%.

RSS high-water growth also exceeded the 10% budget for every candidate. No GC events were observed during those ten-build samples; GC pause overhead therefore remains unmeasured, rather than demonstrated to be zero in general.

The production module measured 74,587 source bytes / 23,551 gzip bytes. The exact chart copy measured 76,920 / 24,311, a 760-byte compressed increase for the module file alone. The grouped core and reused accumulator reference add 26,979 source bytes / 8,094 gzip bytes as separate helpers. The current runtime arrangement adds approximately 8,854 compressed bytes, well above the roughly 1.2 KB 5% footprint budget. This is the measured prototype arrangement; a smaller extracted helper was not implemented or measured.

## Correctness and compatibility

The preserved focused full-chart suite passed **612 checks**. The earlier exact arithmetic and aggregation-reuse suites passed **36** and **187** assertions, and the unchanged Netflow Plot suite passed **363 checks**. The limb and hybrid paths also passed a Node smoke test with the global `BigInt` binding masked. These results establish prototype correctness for the covered cases, not production suitability.

The documented browser targets are Firefox 158, ungoogled Chromium 155, and WebKitGTK 2.52.6. No browser executable was available, so none was tested. The Node BigInt-masked smoke test does not establish compatibility with older browser engines. No package or distribution build was run.

## Reconsideration criteria

Any future research must investigate a **materially different, lower-allocation exact representation**. It must preserve exact finite-sum semantics, explicit out-of-range results, bounded ratios, and legacy non-finite behavior; pass the existing correctness suites; and demonstrate the pre-set latency, memory, and footprint budgets on the same full-chart workload methodology. If a budget or methodology must change, document and justify that change before benchmarking. This investigation does not authorize or begin that future work.
