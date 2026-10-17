# tab-guard changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-17
New option backForwardCache: true (off by default, so nothing changes unless you ask). Pressing Back in Firefox 158.0 reloaded the whole game 3 of 3 times because a held lock keeps a page out of the back/forward cache; with the option it is restored from the cache 3 of 3 and is still in charge. In WebKitGTK 2.52.6 and GNOME Web 46.5 the cached page lost its lock and wrongly heard onTwin then onFree 3 of 3 times; with the option it stays in charge 3 of 3, with no false twin. Chromium 155 was already fine (restored 3 of 3). The lock is given up when the page is left and taken again on return, or after returnMs (default 1000); a copy opened in that gap wins and the returning page becomes the twin once. Added 7 checks (22 to 29). Minified size 2,141 to 2,769 bytes (958 to 1,154 gzip).

Tested in: Node: 29 checks pass (7 new). Real Back-button runs, 3 each, with and without the option: Firefox 158.0 (reports 158.0b5), ungoogled Chromium 155.0.8059.39-1, WebKitGTK 2.52.6, GNOME Web (Epiphany) 46.5. Module browser suite (python3 modules/tab-guard/test/run.py) passes in ungoogled Chromium 155.0.8059.39-1. Not run: that browser suite in Firefox 158.0, WebKitGTK and GNOME Web (no geckodriver on the browsers branch; no driver for the others), a phone

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: Chromium (version not recorded) and Firefox 155 (13 browser checks, at the cut from Apple Press); Chromium 141 (headless, Linux) in the 2026-10-15 full run of `npm run test:kits` and `tests/run.js`. Not run: Firefox 158, ungoogled Chromium 155, WebKitGTK, a phone.

## Before version labels

- 2026-10-14: First version: one open copy of a game at a time (Web Locks), cut from Apple Press 1.27.
- 2026-10-15: Only an `AbortError` now counts as another copy taking over; other lock errors no longer switch saving off.
