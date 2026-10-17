# env-probes changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-16
Faster checks: the clock check now stops after 3 clock steps instead of 8 (in Chromium, 8 steps took about 0.8 ms and stopping after 2 took about 0.2 ms with the same answer), and the canvas check writes its test patch with one call instead of 128 (0.2 to 0.8 ms on the first call instead of 1.6 to 2.8 ms, 3 to 8 times faster, still reading back exactly). New: `canvasNoise()` says how big canvas noise is, `framed()` says whether the page sits inside another page, `capabilities()` lists which newer browser features work, plus hover, any-hover and reduced-transparency questions. `explain()` now says so when saving is blocked inside a frame. The demo is now a one-button device check page with a copy-report button. Everything old answers the same as before.

Tested in: Node checks; the speed figures were measured in Chromium (version not recorded). Firefox for this release: not recorded (Firefox 157 ran `tests/firefox.js` on 2026-10-17: 5 passed). Not run: Firefox privacy-profile test, WebKitGTK, a phone.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: Node checks; the probes in Chromium (version not recorded; Chromium 141 (headless, Linux) in the 2026-10-15 full run of `npm run test:kits` and `tests/run.js`); Firefox 158 per the 2026-10-15 task-board note and Firefox 157 on 2026-10-17 (`tests/firefox.js`): canvas read-back and storage checks pass. Not run: Firefox privacy-profile test, WebKitGTK, a phone.

## Before version labels

- Early October 2026: First version: detects privacy modes that round the clock, scramble canvas read-back or block storage.
- 2026-10-15: The clock check now measures the smallest clock step instead of testing for 100 ms, so Firefox privacy mode (about 16.67 ms) is caught.
