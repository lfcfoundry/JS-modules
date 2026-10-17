# fuzz-kit changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-16
Fixed: a page stuck in an endless loop used to freeze the test run for good (over 100 seconds with a 4-second limit); now the run says "hung" and names the step that froze, in 8 to 11 seconds in Chromium and Firefox. Testing with real keyboard input in Firefox failed on every seed tried (4 of 4) because Firefox does not know the key name "Space"; now 4 of 4 pass. New and optional: `--jobs N` runs seeds in several browsers at once (a slow 16-seed test took 4.7 seconds instead of 12.0 in Chromium, about 2.5 times faster, and 16 instead of 20 in Firefox; each browser uses about 350 MB); `swarm` (`--swarm 0.3`) leaves a random part of the steps out of each run so rare situations show up (on a test game, 15 of 600 seeds found a bug that normal runs never found, 0 of 600, while the common bug turned up 105 times instead of 73; using it on every second seed kept most of both, 95 and 6); `--check-repeat` says in plain words whether a seed plays the same game every time, at the cost of about two extra seeds; `final` is a check that runs once after the last step (for example "undo everything, redo everything, the story must come back the same") and shrinks like any other finding (a failure needing 5 steps was cut from 60 steps to those 5); `Fuzzer.Input.pickVisible` picks a random usable button about 12 times faster on a busy page (0.2 ms instead of 2.4 ms with 400 buttons); `--replay FILE` re-runs a saved short failure with one command (the demo bug replays in 3 steps); `--executable PATH` uses a browser program you name, and `--seeds 1-5,9` accepts lists. Changed: shrinking replays 2 to 9 percent fewer steps and makes about 3 fewer tries, with the same result in 449 of 450 test cases. Everything old works the same. Measured on a 4-core cloud machine in Chromium 141 and 153 and Firefox 157; not yet repeated on Firefox 158 and Chromium 155.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

## Before version labels

- Early October 2026: First version: a seeded, reproducible random-input fuzzer.
- 2026-10-14: Added the shrinker (`Fuzzer.shrink`): a failing run is cut down to a smaller script that still fails the same way.
- 2026-10-15: Merged in `fuzz-play` (real mouse input, Chromium slow-down); `--shrink` now works from both runners; added a hang guard. `marionette-lite` was retired, with a recipe in the README.
