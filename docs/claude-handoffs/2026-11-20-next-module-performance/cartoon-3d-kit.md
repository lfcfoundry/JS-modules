<!-- Copyright (c) 2026 LFC Foundry. MIT License. -->
# Claude handoff: cartoon-3d-kit crowd cost across browsers

**Baseline:** `cartoon-3d-kit` 1.3.0 at repository main `2de1058b` (2026-11-20). **Scope:** extend the crowd demo's performance evidence beyond Chromium. The kit is a guide and demo, not an importable runtime library; keep measurements and code recommendations scoped to the crowd recipe.

## Evidence and hypothesis

The crowd demo compares live DOM hero trees, baked canvas at 60 updates/second, and baked canvas at 30 updates/second. Existing Chromium measurements show that the baked 30/s path helps at 12 and 48 heroes, while the 60/s baked path is roughly even or slightly slower. The 1.3.0 visibility pause lowered work for partly offscreen crowds in Chromium; Firefox and WebKit were checked for pause behavior, but not for cost. The current tracing script relies on Chromium DevTools Protocol, so the README's browser cost table is incomplete.

The central question is whether the same choices hold in Firefox and WebKitGTK, at different device pixel ratios and view sizes, and when the crowd is partly outside the viewport. Use engine-neutral frame-gap measurements alongside browser-specific profiling; do not combine unlike tracing metrics into one cross-browser number.

## Test and performance matrix

Compare live DOM, baked 60/s, and baked 30/s at 1, 12, 48, and 96 heroes. Cross these with `pause=0/1`, a fully visible crowd and a partly/fully offscreen crowd, and viewport widths 320, 412, 768, and 1,280 CSS pixels. Include DPR 1 and 2; test the current skins at least once at the smallest and largest viewport.

For each browser, collect over a settled 10-second interval: RAF gap distribution, missed 60 Hz opportunities, JS callback time where instrumentable, and memory/canvas backing dimensions. In Chromium, also retain the existing `RunTask` tracing metric. Report Chrome task time separately from RAF results in other engines. Alternate modes and crowd sizes across fresh pages.

Measure creation/setup separately from steady-state animation. Include viewport resize and scroll into/out of view, pause/resume, switching live/baked modes, 30/60 update rate, and the 96-hero stress case. Keep browser version, viewport, DPR, hardware, and page zoom fixed per paired run.

## Correctness and visual checks

- Keep the existing demo test: baked canvases contain painted pixels and change over time; live mode has the requested number of heroes; controls switch mode/count; offscreen live heroes pause while visible heroes continue.
- Confirm resize updates canvas backing dimensions without blurry scaling or unbounded memory growth; count/sizing remains correct at DPR 1 and 2.
- Compare color, face, size, grid spacing, bob/blink/aura behavior, and clipping between modes. Do not require pixel-identical animation where the documented baked recipe deliberately updates at a lower rate.
- Honor reduced motion and the kit's contrast/readability checks. Performance edits must not change the guide's documented visual tokens without an owner decision.

Use `node modules/cartoon-3d-kit/test/run.js` for guide/token checks and `modules/cartoon-3d-kit/test/crowd-check.js` for real-browser behavior. Extend `test/cost-crowd.js` only if it can report comparable measurements; otherwise add separate browser-specific output with clearly named metrics.

## Claude sequence

1. Reproduce the existing Chromium cost script and the crowd correctness test before changing the harness.
2. Add Firefox/WebKitGTK RAF and memory reporting while retaining Chromium's trace output as its own metric.
3. Run the matrix one browser at a time, paired and alternating. Record raw measurements and do not aggregate the 30/s and 60/s variants.
4. Recommend changes to the recipe or demo only where a repeated result supports them. If browser rankings differ, document the trade-off instead of selecting one universal default.
