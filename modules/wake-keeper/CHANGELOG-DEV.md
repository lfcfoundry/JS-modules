# wake-keeper developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-17

### Quick
New trimming tool writes a smaller copy without the parts a game does not use. The full file works as before.

### Deep
New: modules/wake-keeper/lean.py writes a copy without the parts a game does not use (4 parts: idle, status, callbacks, inject; --list, --without, -o, --no-comments, --sizes). The full file is unchanged: 2,648 bytes minified, 1,105 gzipped, the same 42 checks pass. Fancy Banana's set (only create with refusalBackoffMs, want, destroy and supported are kept) is 1,417 bytes minified, 660 gzipped: 46% and 40% smaller than the whole file (lower is smaller), against about 566 bytes for Fancy's own inline code. A new test table (run starts, tab hidden, tab back, run ends, request refused with an 8 s wait, lock released by the browser, no wake lock) passes 7 of 7 on the full file, on Fancy's set and on each part cut alone, and in all four browsers; the browser's own lock was used in Chromium and Firefox, a stand-in lock in WebKitGTK and GNOME Web, which refuse the request

## 1.0.0 · API 1 · 2026-10-16

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.
