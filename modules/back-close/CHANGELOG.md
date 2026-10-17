# back-close changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: Chromium (version not recorded) and Firefox 155 (11 browser checks, at the cut from Apple Press); Chromium 141 (headless, Linux) in the 2026-10-15 full run of `npm run test:kits` and `tests/run.js`; Firefox 157.0.1 through the Firefox stand-in (11 checks, 2026-10-17). Not run: Firefox 158, ungoogled Chromium 155, WebKitGTK, a phone.

## Before version labels

- 2026-10-14: First version: the phone back swipe closes the top panel instead of leaving the page (CloseWatcher), cut from Apple Press 1.27.
- 2026-10-15: Added a connected check, a `close()` handle and an opt-in history fallback for browsers without CloseWatcher (such as iPhone Safari).
