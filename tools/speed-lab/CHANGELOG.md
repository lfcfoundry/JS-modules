# speed-lab changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-17
New tool, cut from Apple Press's phone speed test. One button runs a comparison on the device (nothing moving, everything moving, parts switched off) and writes the answer in plain sentences with a copyable table: frames per second, time lost to late frames, stutters over 50 ms, the slowest 5% of frames, how much of the scene was showing. Steps are data (`id`, `label`, `role`, `css`, `setup`). Safeguards from bad runs: it scrolls so half the scene shows under the sticky bar, closes anything covering it, redoes a disturbed step up to 3 times, and warns about heat. At the defaults a 5-step run takes about 30 seconds. Changed from the Apple Press original, which was hard-wired to the game: the steps, the covers, the sticky bar and the scene are options. 17.9 KB (6.6 KB gzipped). 8 checks on the numbers and the answer, plus a real run in Firefox 158 and ungoogled Chromium 155 (five steps, a covering card closed and reported, an unclosable card marking steps disturbed).

Tested in: Node checks where the piece has any; Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6, one at a time, in a real browser (`tests/pieces-browser.js`, 2026-10-17; WebKitGTK 2.52.6 through `tools/webkit-driver`; key down/up and touch were sent as page events or the mouse). Not run: GNOME Web (Epiphany) 46.5, a phone.
