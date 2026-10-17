# frame-kit changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.2.0 · API 1 · 2026-10-17
New: modules/frame-kit/lean.py writes lean copies of even-dt.js (3 parts: options, stats, refreshRule) and quality-governor.js (7 parts: options, control, errors, flipGuard, stats, stallRules, graceStart). The full files are unchanged: 1,536 and 3,688 bytes minified (662 and 1,240 gzipped), the same 67 checks pass. Fancy Banana's sets are 985 bytes minified (506 gzipped) and 1,342 (575): 36% and 24%, and 64% and 54%, smaller than the whole files (lower is smaller), against about 378 and 630 bytes for Fancy's own inline code. Three parts swap in Fancy's rule instead of removing code, so the lean builds give Fancy's exact answers: 0 different frame steps in 50,011 frames and 0 different level changes in 78 governor runs (171 level changes), on 26 frame series, in Node and in all four browsers. The full files do not: they differ on 42,604 of those frames (median 0.026 ms, 99th percentile 1.35 ms, largest 8.8 ms) and in 9 of 78 governor runs; nothing in the full files was changed to match

Tested in: ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web 46.5, one at a time (tests/small-lean-browser.js: 0 failures in each of the four; Chromium and Firefox used the real CloseWatcher with the real Escape key and the browser's own wake lock; WebKitGTK and GNOME Web have no CloseWatcher, so 3 back-close situations say 'not available', and they refuse the wake lock request (NotAllowedError), so their 6 wake-keeper situations ran with a stand-in lock). Not run: a phone, Safari itself; node modules/frame-kit/test/lean.js 27 of 27, 67 older Node checks

## 1.1.0 · API 1 · 2026-10-16
`QualityGovernor` no longer ignores very slow devices. Before, a frame gap over 100 ms was treated as a pause and never counted, so a phone under 10 frames a second was never stepped down; now four long frames in a row count as a slow device. In a simulation with fake frame times a 6.7 fps phone is stepped down after about 15 seconds and a 1 fps phone after about 102 seconds (it still counts 100 frames before it decides). New option `stepUp: false` (only ever steps down) and new `lock()` / `unlock()` keep a level the player picked. A single stall still changes nothing.

Tested in: ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web 46.5, one at a time (tests/frame-kit-browser.js: the 67 checks of test/run.js pass inside the page in each browser, 4 of 4, and about 92 to 94 real animation frames in 1.5 s feed FrameMeter, EvenDt and QualityGovernor without an error in each; 67 Node checks). Not run: a real slow phone, Safari itself

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: 35 Node checks and the example page in Chromium through Playwright for Python (version not recorded; Chromium 141 (headless, Linux) in the 2026-10-15 full run of `npm run test:kits` and `tests/run.js`); `FrameMeter` ran in Pineapple Defense 2026.10.14.0743 with a Chromium and Firefox QA pass (versions not recorded). Not run: WebKitGTK, a phone.

## Before version labels

- Early October 2026: First version: `EvenDt`, `QualityGovernor` and `JobPump`.
- 2026-10-14: New `FrameMeter`: frames a second, slowest frame, hitch count with a game-or-device cause, tap-to-next-frame delay and a plain-words verdict.
- 2026-10-15: `FrameMeter` no longer counts a tab that comes back after a long hidden spell as a hitch. `JobPump` stops on step count when the clock is coarse, and accepts a bare `performance.now`.
- 2026-10-15: New flip-flop guard in `QualityGovernor` (the slow level-up-and-down cycle). It is off unless `flipLimit` is set.
