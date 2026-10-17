# wake-keeper changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-17
New: modules/wake-keeper/lean.py writes a copy without the parts a game does not use (4 parts: idle, status, callbacks, inject; --list, --without, -o, --no-comments, --sizes). The full file is unchanged: 2,648 bytes minified, 1,105 gzipped, the same 42 checks pass. Fancy Banana's set (only create with refusalBackoffMs, want, destroy and supported are kept) is 1,417 bytes minified, 660 gzipped: 46% and 40% smaller than the whole file (lower is smaller), against about 566 bytes for Fancy's own inline code. A new test table (run starts, tab hidden, tab back, run ends, request refused with an 8 s wait, lock released by the browser, no wake lock) passes 7 of 7 on the full file, on Fancy's set and on each part cut alone, and in all four browsers; the browser's own lock was used in Chromium and Firefox, a stand-in lock in WebKitGTK and GNOME Web, which refuse the request

Tested in: ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web 46.5, one at a time (tests/small-lean-browser.js: 0 failures in each of the four; Chromium and Firefox used the real CloseWatcher with the real Escape key and the browser's own wake lock; WebKitGTK and GNOME Web have no CloseWatcher, so 3 back-close situations say 'not available', and they refuse the wake lock request (NotAllowedError), so their 6 wake-keeper situations ran with a stand-in lock). Not run: a phone, Safari itself; node modules/wake-keeper/test/lean.js 12 of 12, 42 older Node checks

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: Node: 42 checks pass (rerun 2026-10-17). navigator.wakeLock exists in Firefox 158.0 (feature check only). Not run: a real wake lock in any test browser, a phone

## Before version labels

- 2026-10-14: First version: keeps the screen awake only while wanted; released on pause, hidden tab and idle, asked again when allowed.
- 2026-10-15: Fixed pause-then-resume before the browser answered, which left no screen lock: the stale lock is now released and a new one requested.
