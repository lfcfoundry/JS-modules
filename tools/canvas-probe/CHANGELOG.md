# canvas-probe changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-16
- The probe slows your game less, and a new check gives a plain pass or fail with problems listed in words.

## 1.0.0 · API 1 · 2026-10-16
- First labeled version. Nothing in the code changed.

## Before version labels

- 2026-10-14: First version: a test-build counter for canvas 2D games (calls per frame, save/restore leaks, draws below half size).
- 2026-10-15: No more false "slow leak" after `ctx.reset()` or a canvas resize; painted area is counted per canvas; more counters.
