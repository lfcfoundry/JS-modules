# Claude plan: speed-lab

## Objective

Re-qualify the current 1.1.1 implementation and determine whether collecting frame gaps materially perturbs the page. Keep this investigation docs-only unless a real browser result shows a repeatable correctness or performance problem.

## Browser and environment rule

Before browser work, re-read the repository's current browser knowledge-base instructions. Use only the currently approved Firefox 158.0, ungoogled Chromium 156.0.8078.79-1, and WebKitGTK 2.52.6 on Linux x86_64, one browser at a time. Do not use GNOME Web for qualification. Record exact version, viewport, refresh rate where available, OS, and whether the display is foregrounded.

This Codex review ran on Node v26.13.1 for Android arm64. It did not run the browser suite.

## Baseline first

Run the existing Node checks, then the speed-lab browser check. Preserve raw per-step gaps and results for each run. Include the five-step default case and the existing disturbed-step cases: no rAF callbacks, hidden document, slow first baseline, one-off slow load, and a cover that cannot be closed.

For overhead, use a local deterministic animation page with the same visual workload in all variants. Alternate the shipped instrumentation and a minimal timestamp recorder in the same page and browser. Compare callback count, median and 95th-percentile frame gap, late-frame count, and the module's final verdict. Do not use the module's own FPS verdict as the only measurement of its overhead.

## Permutations

1. Refresh rates: 60, 90, and 120 Hz where the display/browser supports them.
2. Per-frame work: idle; 5, 10, 13, 15, 17, 20, and 25 ms of deterministic main-thread work.
3. Recording and warm-up windows: current 2.5 s / 1.1 s baseline; keep the current 1.1 s warm-up fixed while testing any alternate recording window.
4. Long-frame observer: supported and unsupported browser; distinguish the Chromium-only loaf fields from the cross-browser gap data.
5. Lifecycle: foreground; background/hidden; rAF suspended; page restored before timeout.
6. Compare instrumentation cost separately from verdict sensitivity. A faster run that misses the planted 17 ms slowdown or increases false alarms is a regression.

Use paired and alternating runs. Use at least 12 runs per overhead cell and enough planted-slowdown trials to report detection counts and false alarms. Record spread, not only the best run.

## Decision gates

- Keep current defaults unless a candidate has a repeatable improvement larger than the paired-run noise.
- A candidate must preserve all current output fields and the empty, hidden, watchdog, cold-start, and one-off-slow-load answers.
- Treat a change smaller than 5% of per-frame overhead, or smaller than the observed run-to-run spread, as no demonstrated gain.
- Do not shorten the default window unless the planted-slowdown and false-alarm table is at least as strong as the current review's table.
- Run node tools/speed-lab/test/run.js and the real browser suite after any code change. No timing threshold belongs in a Node unit test.

## Possible outcome

A report that finds no meaningful callback overhead is a successful result. The existing typical stat cost is about 18 microseconds for a 150-gap sample, after the step is finished. Do not optimize that path unless a browser profile identifies a measurable source of page disturbance.
