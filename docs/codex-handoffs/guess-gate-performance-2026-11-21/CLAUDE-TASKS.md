# Claude task plan: guess-gate

## Goal

Check whether reusing the eligibility timestamp in run() has any measurable end-to-end value. A no-change conclusion is expected unless an actual high-frequency consumer shows a gain.

## 1. Rebase and inspect

- Start from current main and inspect module changes after c4c6b3a2ec6bce937b6017c427ff23c4e996cff2.
- Read AGENTS.md, TASKS.md, the module README and tests, and the latest private approved-browser policy.
- Review the README's prior browser results for the 5% default. Do not adjust the default share based on this microbenchmark.

## 2. Compare current and fused timestamp variants

Use identical call sites for:

A. Current implementation: one clock read for eligibility, a second for callback start, and a third for callback end on success.
B. Fused check/start: take one timestamp, use it for both eligibility and callback start, then read once after callback.
C. If preserving exact callback timing is required, retain the current implementation and report the cost of the extra clock read; do not claim a speedup from an implementation that changes the metric.

The fused candidate charges eligibility-check time to the guess. Confirm that this conservative accounting still meets the API's budget contract and document any near-boundary decision changes.

## 3. Correctness permutations

Add candidate tests for:

- Clock-call counts before start, after finish, on skipped calls, and on successful calls.
- Share values 0.05, 0.1, 0.5, and 1; minMs 0 and 40.
- Estimate omitted, zero, equal to last cost, below and above last cost, negative, NaN, and near the exact admission boundary.
- No-op callbacks, measurable callbacks, callbacks that throw, and a callback that calls stats()/allowed()/nextIn().
- Real monotonic clock and deterministic injected clocks.
- start() reset, finish() idempotence, skipped and guess totals, spent/elapsed statistics, and nextIn() boundary behavior.

The existing module suite must pass unchanged. Compare public statistics and admission decisions for realistic positive-cost schedules; note the timestamp accounting difference instead of hiding it.

## 4. Performance permutations

Measure the actual use pattern, not only a dense no-op loop:

- Dense successful gate calls at 100, 10,000, and 250,000 calls.
- Skip-heavy patterns with 5%, 50%, and 95% calls admitted.
- README-shaped 40-chunk import (4 ms parse chunks, 40 ms minMs, default 5% share), plus 100/1,000/10,000 chunk synthetic streams.
- A real consumer's import/parse/draw timeline if one is available.
- Report gate-only time, total import/draw time, admitted/skipped count, and any change in total guesses.
- Warm up and alternate implementation order; report median, p95, spread, runtime/build, and timer source.

Before browser timing, reread the private browser policy and test Firefox, ungoogled Chromium, and WebKitGTK one at a time. The recorded versions on 2026-11-21 were Firefox 158.0, ungoogled Chromium 156.0.8078.79-1, and WebKitGTK 2.52.6 on Linux x86_64.

## 5. Decision gate

Ship a fused timestamp only if:

- All admission, accounting, exception, and statistics checks pass.
- The scheduling change near boundaries is understood and stays conservative.
- A real import or consumer timeline improves repeatably, not just a dense synthetic no-op loop.
- No browser has a measurable regression or different practical guess schedule.

If only the module-only success loop improves while skip-heavy/import timelines remain unchanged, keep version 1.0.1 and report no source change. If adopted, update tests, changelog/version via repository tools, and the README only with supported-browser evidence.

## 6. Handoff back

Return a separate branch with raw benchmark data, exact environment, tests, browser versions, and the final decision. Do not present Node results as browser timings.