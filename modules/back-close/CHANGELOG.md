# back-close changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-17
New watchWhen(isOpen, close) for panels that are not a single element (drawn on a canvas, or several panels one back swipe should close together), a sync() on the handle, and options isShown and attributes for panels shown by a CSS class instead of hidden. Existing code behaves as before: watch(panel, close) has the same results in all 23 earlier checks. Added 7 checks (23 to 30). README now says where CloseWatcher is: Chrome 126, Firefox 149, Safari Technology Preview 249 only (stable Safari 27 not confirmed), WebKitGTK 2.52.6 none. Minified size 2,139 to 2,450 bytes (931 to 1,049 gzip).

Tested in: Node: 30 checks pass (7 new). Module browser suite passes in ungoogled Chromium 155.0.8059.39-1. Not run: that browser suite in Firefox 158.0, WebKitGTK and GNOME Web (no geckodriver on the browsers branch; no driver for the others), a phone. CloseWatcher itself is absent in WebKitGTK 2.52.6

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: Chromium (version not recorded) and Firefox 155 (11 browser checks, at the cut from Apple Press); Chromium 141 (headless, Linux) in the 2026-10-15 full run of `npm run test:kits` and `tests/run.js`; Firefox 157.0.1 through the Firefox stand-in (11 checks, 2026-10-17). Not run: Firefox 158, ungoogled Chromium 155, WebKitGTK, a phone.

## Before version labels

- 2026-10-14: First version: the phone back swipe closes the top panel instead of leaving the page (CloseWatcher), cut from Apple Press 1.27.
- 2026-10-15: Added a connected check, a `close()` handle and an opt-in history fallback for browsers without CloseWatcher (such as iPhone Safari).
