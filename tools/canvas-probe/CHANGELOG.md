# canvas-probe changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-16
The probe now slows the game less (about 40 to 60 percent less extra time per frame in a Chromium test) because it reads the transform once per draw. New: probe.check(limits) gives a pass or fail with plain-words problems (leaks, restore without save, source overhang, growing paths, and a calls-per-frame ceiling); the report has a per-frame total of calls; and install({ deep: true }) counts draws made with a filter, a shadow or a blend mode. README now explains the rejected-style-write and method-name limits and says to run games with their quality governor off while the probe is on.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

## Before version labels

- 2026-10-14: First version: a test-build counter for canvas 2D games (calls per frame, save/restore leaks, draws below half size).
- 2026-10-15: No more false "slow leak" after `ctx.reset()` or a canvas resize; painted area is counted per canvas; more counters.
