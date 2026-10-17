# stage-curtains changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-17
Painting ahead on a busy page: on a page that never has a quiet moment (the test page is busy 18 ms of every 16.7 ms frame), the curtain was ready after 3.6 s in Chromium and 3.5 s in Firefox; now 1.0 s and 0.6 s (about 3.6 and 5.7 times faster). With the processor slowed 4 times in Chromium: 13.4 s before, 3.2 s now. The browser's forced turn now comes after 250 ms instead of 800 ms and paints a slice of 5 ms instead of 2.5 ms. Nothing changes on a quiet page (0.28 to 0.34 s before, 0.23 to 0.30 s now). Closing without painting ahead: `close()` used to paint everything in one block, freezing the page for up to 31 ms in Chromium, 31 ms in Firefox, 19 ms in WebKitGTK (128 ms with the processor slowed 4 times). It now paints 4 ms a frame, so the longest freeze is 16 ms, 13 ms, 13 ms (68 ms slowed 4 times). The cost is a later start when the processor is slow: 324 ms instead of 128 ms before the first piece moves (62, 39 and 45 ms instead of 45, 54 and 54 ms on a fast one). New option `warmMs` (default 2500): the most time `close()` may take painting a little each frame before it finishes the rest at once; `0` gives the old all-at-once behavior. Turned phone: if the window is turned or resized between `prepare()` and `close()`, the velvet is painted again for the new size. Before, a gap of 491 pixels (Chromium and Firefox) or 455 pixels (WebKitGTK) stayed open in the middle in the 915 by 412 test; now none (the halves overlap by 13 pixels, as designed). Cancelled zoom: when the browser cancels the last open animation, the curtain is now removed after 0.11 s; before it stayed for 2.06 s until the safety timer. The file grew by 1,833 bytes as written (28,715 to 30,548), 593 bytes minified (13,469 to 14,062) and 177 bytes compressed (5,495 to 5,672, about 3.2%). Not measured: a real phone, GNOME Web.

Tested in: Node checks with a fake DOM (26, 5 of them new; the 3 new curtain checks fail on 1.0.0); the comparison page in ungoogled Chromium 155.0.8059.39-1, Firefox 158.0 and WebKitGTK 2.52.6 (close, open, stalled and cancelled animations, turned window); then the repository's own suites one browser at a time: tests/run.js in ungoogled Chromium 155.0.8059.39-1 (29 pass), tests/firefox.js in Firefox 158.0 (5 pass), and in WebKitGTK 2.52.6 the piece, demo and same-answers suites (all pass); close and open of the curtain also ran in WebKitGTK 2.52.6 and GNOME Web 46.5 without errors. Not run: a phone.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: Node checks with a fake DOM; Chromium 141 (headless, Linux) in the 2026-10-15 full run of `npm run test:kits` and `tests/run.js`; Firefox 158 per the 2026-10-15 task-board note and Firefox 157 on 2026-10-17 (`tests/firefox.js`): close puts both halves in place, open removes the curtain. Not run: WebKitGTK, a phone.

## Before version labels

- Early October 2026: First version, cut from the games.
- 2026-10-15: `prepare()` now finishes in browsers that lack `requestIdleCallback`; before, it could wait forever.
- 2026-10-15: The finished curtain half is no longer cancelled, which made the curtain jump a hair on a phone.
- 2026-10-15: README: added prior art (View Transitions, Motion `curtains()`) and removed the link to the source game.
