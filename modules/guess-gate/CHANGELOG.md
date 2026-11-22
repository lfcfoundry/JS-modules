# guess-gate changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.0.2 · API 1 · 2026-11-21
- README now says plainly that the share is a target: one unexpectedly long guess can go over, then guesses wait. stats().elapsed stops at finish().

## 1.0.1 · API 1 · 2026-11-21
- Guesses use at most 5% of the time so far by default (was 10%): at 10% a progressive import ran 12% slower than none in WebKitGTK 2.52.6; at 5% Chromium 156, Firefox 158 and WebKitGTK are within noise of none.

## 1.0.0 · API 1 · 2026-11-21
- New module: a time-boxed scheduler for first guesses during an import; guesses may use only a set share (10% by default) of the time so far, so a progressive import costs about the same total time as one without guesses.
