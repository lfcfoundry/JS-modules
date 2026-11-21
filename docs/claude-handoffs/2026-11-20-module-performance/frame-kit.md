<!-- Copyright (c) 2026 LFC Foundry. MIT License. -->
# Claude handoff: frame-kit JobPump cost and budget behavior

**Baseline:** `frame-kit` 1.2.1 at repository commit `68816c2b` (2026-11-20). **Scope:** benchmark `JobPump.run()` under realistic queues and clock resolutions. Do not retune defaults or alter behavior of the other three helpers as collateral.

## Why this module

`JobPump` is the module's frame-sliced work runner. Its README documents that it checks its budget after each step, that a single oversized step can overrun the budget, and that a coarse clock uses a step-count fallback. Existing tests cover ordering, exceptions, queue mutation, budget overshoot, and coarse-clock operation. The useful open question is the fixed scheduling overhead and tail behavior across queue sizes, budgets, step shapes, and clock resolutions—not whether the existing correctness suite passes again.

## Test and workload matrix

Run 1, 100, 1,000, and 10,000 queued work units with: plain functions, short generators, and a mixed queue. Step costs should include no-op, about 0.1 ms, 1 ms, and a deliberately over-budget 5 ms step. Test budgets of 1, 3, and 8 ms.

Exercise clocks with fine sub-millisecond advances, 1 ms rounding, 16.67 ms rounding, and a frozen-then-advancing clock. Add interruptions: hidden-tab-sized gaps, a job that enqueues work, `clear()` during a job, a throwing job, and a generator that yields many times. Use virtual clocks for correctness; use real clocks only for performance.

Measure both one `run()` call and the full completion of a fixed workload. Record jobs/steps completed per call, calls to the clock, longest uninterrupted slice, overshoot, total elapsed time, and queue wait time for early and late jobs.

## Correctness checks

- Preserve first-in/first-out behavior, generator continuation, clear/add semantics, and error isolation.
- With a fine clock, verify the overrun is bounded by one step plus measurement noise. With a coarse clock, verify the documented step-count fallback prevents waiting a whole clock tick before yielding.
- Ensure no job is duplicated, skipped, or reordered after nested add/clear or an exception.
- Keep the existing 67-check Node and browser coverage; add only missing queue/clock combinations that expose a stated gap.

## Benchmark protocol and decision gate

Use the current supported browsers one at a time and an identical deterministic job stream. Separate timer-call overhead from job work by reporting both no-op and nontrivial steps. Run paired baseline/prototype pages in alternating order and capture at least seven fresh-page pairs per browser for warm-up-sensitive cases. Do not make the performance benchmark a flaky pass/fail timing test.

An internal queue representation or clock-check change is justified only if it improves throughput or tail slice cost beyond measurement spread for a documented workload, while preserving the budget and queue guarantees. A 10% improvement on 10,000 no-op jobs alone is not enough if real 1 ms jobs dominate; report both. Any new option needs a demonstrated use case and must leave defaults unchanged.

## Claude sequence

1. Inspect `job-pump.js` and existing tests around coarse clocks and queue mutation; do not change `EvenDt`, `QualityGovernor`, or `FrameMeter` in the same patch.
2. Add a separate benchmark script or extend the existing frame-kit performance harness; keep deterministic correctness checks in `test/run.js`.
3. Capture baseline and identify whether work is dominated by the clock, queue maintenance, or the step itself.
4. Implement one internal change only if the baseline supports it; rerun the full suite and report the slice/throughput trade-off.
