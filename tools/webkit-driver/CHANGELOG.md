# webkit-driver changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.3.0 · API 1 · 2026-10-18
- New attach() lets a check reuse a WebKit browser that is already open instead of starting a new one.

## 1.2.0 · API 1 · 2026-10-17
- Scripted input in GNOME Web now behaves like a real mouse and keyboard for pages that use pointer events, so all five piece checks pass there.

## 1.1.0 · API 1 · 2026-10-17
- Killing a test run no longer leaves stray processes behind, and clicks are faster.

## 1.0.0 · API 1 · 2026-10-17
- First version: starts WebKitGTK or GNOME Web and gives Playwright-style page calls with no packages.
