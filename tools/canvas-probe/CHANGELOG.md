# canvas-probe changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-16
The probe slows the game less: on a test frame of 5,500 canvas calls it added 2.3 ms instead of 3.7 ms to a 3.1 ms frame (about 40 percent less extra time in one run, up to 60 percent in another, in Chromium 141), because it now reads the transform once per draw. New: `probe.check(limits)` gives a pass or fail with plain-words problems (leaks, restore without save, source overhang, growing paths, and a calls-per-frame ceiling) so a game needs no checking code of its own; the report has a per-frame total of calls; and `install({ deep: true })` counts draws made with a filter, a shadow or a blend mode, the ones that cost the most. README now explains the rejected-style-write and method-name limits and says to run games with their quality governor off while the probe is on. The code is the same size (12,672 against 12,678 bytes minified before the new options).

Tested in: Chromium 141 (94 Node checks and 18 browser checks pass) and Chromium 153 (real canvas). Not run: Firefox, ungoogled Chromium 155, WebKitGTK, a phone.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: Chromium (version not recorded): 24 Node checks with a fake canvas and 9 browser checks on a real canvas; Chromium 141 (headless, Linux) in the 2026-10-15 full run of `npm run test:kits` and `tests/run.js`. Not run: Firefox, WebKitGTK, a phone.

## Before version labels

- 2026-10-14: First version: a test-build counter for canvas 2D games (calls per frame, save/restore leaks, draws below half size).
- 2026-10-15: No more false "slow leak" after `ctx.reset()` or a canvas resize; painted area is counted per canvas; more counters.
