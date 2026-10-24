# fuzz-kit changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.3.4 · API 1 · 2026-10-24
- README notes that GNOME Web is no longer a test browser; naming it still works. No code change.

## 1.3.3 · API 1 · 2026-10-22
- 1.3.3: Chromium's refusals of a file picker that no real tap opened or that closed at once ('User activation required', 'Must be handling a user gesture', 'The user aborted a request') are no longer findings.

## 1.3.2 · API 1 · 2026-10-22
- 1.3.2: the WebKitGTK and GNOME Web runs no longer use eval, so games with a strict policy (no unsafe-eval) run all their operations there too.

## 1.3.1 · API 1 · 2026-10-22
- 1.3.1: the runner no longer waits for the page with script that needs eval, so games with a strict policy (no unsafe-eval) run all their operations.

## 1.3.0 · API 1 · 2026-10-22
- New: the background hunt and the runner now also drive WebKitGTK and GNOME Web, so all four test browsers can be hunted. A stuck page in WebKit is reported as hung, as in Chrome and Firefox.

## 1.2.0 · API 1 · 2026-10-22
- New background hunt: start a long fuzz run that carries on without the terminal, stops on request, and writes its findings to a folder. Chrome and Firefox now; the runner also works with puppeteer-core.

## 1.1.0 · API 1 · 2026-10-16
- Fixed: a page stuck in an endless loop no longer freezes the whole test run; it is reported as hung with the step that froze.
- Keyboard tests now work in Firefox, and tests can run in several browsers at once.

## 1.0.0 · API 1 · 2026-10-16
- First labeled version. Nothing in the code changed.

## Before version labels

- Early October 2026: First version: a seeded, reproducible random-input fuzzer.
- 2026-10-14: Added the shrinker (`Fuzzer.shrink`): a failing run is cut down to a smaller script that still fails the same way.
- 2026-10-15: Merged in `fuzz-play` (real mouse input, Chromium slow-down); `--shrink` now works from both runners; added a hang guard. `marionette-lite` was retired, with a recipe in the README.
