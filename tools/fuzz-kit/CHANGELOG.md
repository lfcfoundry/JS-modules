# fuzz-kit changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-16
- Fixed: a page stuck in an endless loop no longer freezes the whole test run; it is reported as hung with the step that froze.
- Keyboard tests now work in Firefox, and tests can run in several browsers at once.

## 1.0.0 · API 1 · 2026-10-16
- First labeled version. Nothing in the code changed.

## Before version labels

- Early October 2026: First version: a seeded, reproducible random-input fuzzer.
- 2026-10-14: Added the shrinker (`Fuzzer.shrink`): a failing run is cut down to a smaller script that still fails the same way.
- 2026-10-15: Merged in `fuzz-play` (real mouse input, Chromium slow-down); `--shrink` now works from both runners; added a hang guard. `marionette-lite` was retired, with a recipe in the README.
