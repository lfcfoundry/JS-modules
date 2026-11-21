<!-- Copyright (c) 2026 LFC Foundry. MIT License. -->
# Next five module handoffs for Claude

Prepared from the `JS-modules` repository after the first five-module handoff. This batch excludes the modules in the earlier set (`netflow-hierarchy`, `pad-nav`, `frame-kit`, `field-report`, `fly-to-mini`) and avoids a matching active remote branch found in the branch/task-board audit.

| Module | Current version | Investigation focus |
|---|---:|---|
| [sticker-text](sticker-text.md) | 1.2.0 | Paint cost and legibility trade-offs for shadow-ring text across content sizes and update rates. |
| [hold-press](hold-press.md) | 1.1.0 | Per-control attach/press/repeat cost, event-listener lifetime, and whether any optimization matters beyond synthetic stress. |
| [fx-governor](fx-governor.md) | 1.1.1 | Per-frame overhead and adaptation behavior across refresh rates, pauses, and loading states. |
| [idle-core](idle-core.md) | 1.2.0 | Exact price and purchase boundaries across JavaScript engines; measure any precision fix against speed. |
| [cartoon-3d-kit](cartoon-3d-kit.md) | 1.3.0 | Live versus baked crowd costs beyond Chromium, including frame rate, visibility, viewport, and pixel ratio. |

## Handoff rule

These are investigation plans, not approval to change defaults. Record the current implementation and baseline first. Implement only when the tests expose a real gap or measurements show a repeatable benefit for a stated use case. Keep the unchanged behavior when a proposed improvement is within noise or costs more complexity than the measured gain.

For timing work, separate setup, steady-state work, and output/paint. Pair and alternate baseline and candidate runs in the same browser. Report sample count, median, spread, browser version, viewport, and raw results. Keep browser-specific metrics separate when the engines expose different instrumentation.

## Shared repository constraints

- Read `AGENTS.md`, `TASKS.md`, the module README/changelog, and current tests before editing.
- Keep library source dependency-free, ES5, and UMD; do not change defaults or public APIs without evidence and an explicit owner decision.
- Use the browser builds and one-at-a-time test process recorded in the repository's browser knowledge base. Recheck that source before a browser run.
- Run correctness checks before timing checks. Do not put fragile wall-clock thresholds in unit tests.
- Keep source and its tests limited to the module being investigated. Add no dependency to a shipped module for a test-only oracle or profiler.
