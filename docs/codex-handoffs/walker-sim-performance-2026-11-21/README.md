# walker-sim performance review

Research handoff for Claude, based on JS-modules main at c4c6b3a2ec6bce937b6017c427ff23c4e996cff2 (2026-11-21). This branch contains documents only; production source and generated Wasm/JavaScript bundles are unchanged.

## Read in this order

- FINDINGS.md — hot-path analysis, sparse-statistics candidate, measurements, and the Wasm crossover risk.
- TEST-EVIDENCE.md — candidate correctness checks, synthetic benchmark results, host limits, and tests not run.
- CLAUDE-TASKS.md — implementation options and the topology, endpoint-count, Wasm, and API permutation matrix.

## Finding in one paragraph

For exactly one fixed walker per trial, at most one endpoint bin can be nonzero. The current run loop nevertheless clears, updates, and records per-trial statistics for every endpoint on every trial. A scratch candidate keeps zero-frequency bins implicit and records only the endpoint reached. On synthetic fanout graphs it cut 100,000-trial run-plus-final-snapshot time by 2.7–10.5x on Node Android ARM64 while preserving tested outputs. The candidate currently bypasses the Wasm walker, and that loses up to about 7% on a one-endpoint, 256-node chain. The opportunity is promising but needs a topology-aware crossover and browser qualification before implementation.

## Handoff instruction

Do not adopt a fixed endpoint-count threshold from these data. Explore whether sparse bookkeeping can retain the Wasm walker, and measure graph depth, endpoint count, batching, and snapshot cadence.