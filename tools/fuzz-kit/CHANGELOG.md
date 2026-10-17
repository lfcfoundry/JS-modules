# fuzz-kit changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-16
Two fixes found by running in real browsers: the hang guard now really reports a frozen page (before, the run never came back), and the real-input option now works in Firefox (it failed on the Space key). New and optional: swarm testing (each seed uses only part of the operations), a final end-of-run check, a fingerprint per run with a repeat check, replay from a saved file, running several seeds side by side (--jobs), a cheaper way to pick a visible button (pickVisible), comma lists of seeds, and --executable in the Playwright runner. Everything old works the same. The README has the numbers and what is still untested.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

## Before version labels

- Early October 2026: First version: a seeded, reproducible random-input fuzzer.
- 2026-10-14: Added the shrinker (`Fuzzer.shrink`): a failing run is cut down to a smaller script that still fails the same way.
- 2026-10-15: Merged in `fuzz-play` (real mouse input, Chromium slow-down); `--shrink` now works from both runners; added a hang guard. `marionette-lite` was retired, with a recipe in the README.
