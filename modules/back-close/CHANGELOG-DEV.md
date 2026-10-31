# back-close developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.2.0 · API 1 · 2026-10-17

### Quick
New trimming tool writes a smaller copy of the file without the parts your game does not use. The full file works as before.

### Deep
New: modules/back-close/lean.py writes a copy without the parts a game does not use (4 parts: history, element, closeRoute, supported; --list, --without, -o, --no-comments, --sizes). The full file is unchanged: 2,467 bytes minified, 1,067 gzipped, the same 30 checks pass. Fancy Banana's set (only watchWhen, sync and destroy are kept) is 842 bytes minified, 415 gzipped: 66% and 61% smaller than the whole file (lower is smaller), against about 255 bytes for Fancy's own inline code. A new test table (panel opens, closes by its own button, a back request closes the newest panel and the other stays closable, no CloseWatcher) passes on the full file, on Fancy's set and on each part cut alone: 4 of 4 situations in Chromium and Firefox, 1 of 4 in WebKitGTK and GNOME Web, which have no CloseWatcher and say 'not available' for the other 3

## 1.1.0 · API 1 · 2026-10-17

### Quick
New ways to close panels that are not a single page element (drawn on a canvas, or several panels one back swipe should close together). Existing code works as before.

### Deep
New watchWhen(isOpen, close) for panels that are not a single element (drawn on a canvas, or several panels one back swipe should close together), a sync() on the handle, and options isShown and attributes for panels shown by a CSS class instead of hidden. Existing code behaves as before: watch(panel, close) has the same results in all 23 earlier checks. Added 7 checks (23 to 30). README now says where CloseWatcher is: Chrome 126, Firefox 149, Safari Technology Preview 249 only (stable Safari 27 not confirmed), WebKitGTK 2.52.6 none. Minified size 2,139 to 2,450 bytes (931 to 1,049 gzip).

## 1.0.0 · API 1 · 2026-10-16

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.
