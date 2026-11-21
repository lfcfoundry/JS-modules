<!-- Copyright (c) 2026 LFC Foundry. MIT License. -->
# Claude handoff: field-report bounded logging overhead

**Baseline:** `field-report` 1.1.1 at repository commit `68816c2b` (2026-11-20). **Scope:** measure recording overhead and bounded-buffer rollover. Keep the no-network behavior, report format, and current frame modes intact.

## Why this module

The frame-time path already uses a 3,600-entry ring without allocating on every frame. Other bounded logs use `shift()` at capacity: app tasks and browser long tasks keep 300 entries; errors keep up to 200; the tap detector keeps a small rolling list. That is simple and probably adequate at normal event rates. The open question is whether sustained task/long-task/error input makes rollover expensive enough to matter, and whether replacing any one list with a ring would improve total page cost without complicating chronological report output.

## Test and workload matrix

Compare `frames: false`, `frames: 'external'`, `frames: 'play'`, and default own-frame mode. Use an otherwise identical page loop at 30 and 60 FPS; include a still page where `'play'` stays off. Measure with console capture on and with `console: false`.

Exercise bounded storage at capacities: just below, exactly at, and 1, 10, and 1,000 entries beyond each cap. Generate distinct and repeated errors, task times, and long-task observer entries. For long tasks, test both PerformanceObserver present and unavailable. Include speed/error report serialization before and after rollover.

Measure (a) frame callback cost with no logging; (b) callback cost with field-report enabled; (c) event-ingestion cost; and (d) report generation separately. Use enough frames to expose sustained overhead, but keep the reporter out of the timer used to measure its own callback where possible.

## Correctness checks

- The retained frame/task/error/long-task records remain bounded and in chronological order, newest first or oldest first exactly as the current public report expects.
- Dropped-error counts and repeated-error coalescing remain correct at rollover boundaries.
- `stop()` removes observers/listeners and restores the console; repeated `stop()` remains safe.
- `frames: 'external'` still schedules no callback of its own; `'play'` records only while enabled; hidden-page frames remain dropped.
- Keep `speedText()` and `errorsText()` field names and table shape unchanged unless an explicit API decision authorizes a format change.

Inspect `modules/field-report/test/run.js` and `tests/field-report-browser.js`; extend their fakes only for uncovered rollover cases. Preserve all existing 44 Node checks.

## Benchmark protocol and decision gate

Run baseline and candidate in alternating order in the supported browsers, one browser at a time. Report per-frame CPU/elapsed overhead and p50/p95 frame gaps, plus retained entry count and serialized report size. For event bursts, report throughput and cost at each cap boundary. Include raw samples and the browser's measurement resolution; do not infer sub-millisecond gains from a coarse timer.

Use a circular buffer only for a list whose rollover cost is repeatably visible in the intended workload. Require exact output order and count parity. If ring maintenance is within noise or increases steady-state frame cost, keep the current simpler array implementation.

## Claude sequence

1. Baseline the four frame modes and all bounded-list rollover paths before editing.
2. Add correctness tests for any missing boundary/order behavior; keep timing out of the assertion suite.
3. Prototype one buffer at a time and compare both ingestion and report-generation cost.
4. Retain only measured wins, document the event rate where each matters, and leave unrelated buffers unchanged.
