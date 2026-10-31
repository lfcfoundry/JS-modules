# env-probes developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-16

### Quick
The clock and canvas checks are faster, with the same answers. New checks say how big canvas noise is, whether the page sits inside another page, and which newer browser features are present.

### Deep
Faster checks: the clock check now stops after 3 clock steps instead of 8 (in Chromium, 8 steps took about 0.8 ms and stopping after 2 took about 0.2 ms with the same answer), and the canvas check writes its test patch with one call instead of 128 (0.2 to 0.8 ms on the first call instead of 1.6 to 2.8 ms, 3 to 8 times faster, still reading back exactly). New: `canvasNoise()` says how big canvas noise is, `framed()` says whether the page sits inside another page, `capabilities()` lists which newer browser features work, plus hover, any-hover and reduced-transparency questions. `explain()` now says so when saving is blocked inside a frame. The demo is now a one-button device check page with a copy-report button. Everything old answers the same as before.

## 1.0.0 · API 1 · 2026-10-16

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.
