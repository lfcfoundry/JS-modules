# canvas-probe changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

## Before version labels

- 2026-10-14: First version: a test-build counter for canvas 2D games (calls per frame, save/restore leaks, draws below half size).
- 2026-10-15: No more false "slow leak" after `ctx.reset()` or a canvas resize; painted area is counted per canvas; more counters.
