<!-- Copyright (c) 2026 LFC Foundry. MIT License. -->
# Claude handoff: fx-governor behavior and frame overhead

**Baseline:** `fx-governor` 1.1.1 at repository main `2de1058b` (2026-11-20). **Scope:** validate the measured-window policy and quantify its per-frame cost. Do not merge it into `frame-kit` or retune defaults during this investigation.

## Evidence and hypothesis

`FxGovernor` averages frame rate over seconds, waits for repeated slow windows, ignores pauses and loading when configured, and never steps below `maxAuto` without permission. It can use its own animation-frame loop or be called from the game's loop. The README notes that the most recent Node check did not open the demo in the supported browsers, and the comparison with `frame-kit` is explicitly not measured in browsers.

The open questions are whether own-loop and integrated modes have negligible overhead, whether the window policy behaves as intended at 30/60/120 Hz, and whether manual choice/resting really stops unnecessary callbacks. This is policy validation first; the existing time-window behavior should not be altered just to improve a synthetic response-time number.

## Test matrix

Use deterministic frame streams for 30, 60, 90, 120, and 144 Hz. For each, test `expectedPeriod` set and unset, plus an explicit `minFps` that overrides it. Workload rates should be comfortably above, just above, just below, and far below the computed threshold. Include stable slow, alternating good/bad windows, and a sudden slowdown followed by recovery.

Exercise `strikes` 1/2/3, `severe` above/below the threshold, `longGaps` 1/3, and `maxAuto` at the first and last level. Cross with these lifecycle cases: hidden tab, one/two/three long gaps, `waitForReady`, `ready()` after a delayed load, `startAfterMs`, `choose()` then `release()`, reaching the resting state, and callback exceptions.

Measure frame-call time and animation-frame callback count for: no governor, `frame(t)` in the game's loop, and `start()` with its own loop. Report decision latency separately from overhead. In the browser, compare stable frame streams and a controlled slow workload; do not use an uncontrolled busy loop as the only frame-rate source.

## Correctness checks

- A normal 30 Hz device is not blamed when `expectedPeriod` is 33.3 ms; explicit `minFps` takes precedence.
- Pauses reset the slow streak; repeated `longGaps` count only at the documented threshold. Loading remains excluded until ready/warm-up passes.
- The governor moves one level per qualifying decision except the documented severe case, never exceeds `maxAuto`, and never resumes automatic decisions after `choose()` until `release()`.
- A throwing callback does not escape. Once no automatic decision remains, no recurring RAF is scheduled until released.
- Keep all current `modules/fx-governor/test/run.js` checks and add missing stream transitions only.

## Decision gate and Claude sequence

1. Inspect current Node tests and demo; run existing deterministic checks first.
2. Add or extend a browser harness for real RAF scheduling and report browser versions. Keep virtual streams as the exact policy oracle.
3. If callback overhead is within measurement noise and resting stops correctly, recommend no code change. If it is measurable, isolate schedule/cancel and sample arithmetic before changing the policy.
4. Any threshold or policy change requires an explicit behavior matrix and owner approval; do not silently alter defaults.
