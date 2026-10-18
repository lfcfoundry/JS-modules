# back-close changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.2.0 · API 1 · 2026-10-17
- New trimming tool writes a smaller copy of the file without the parts your game does not use. The full file works as before.

## 1.1.0 · API 1 · 2026-10-17
- New ways to close panels that are not a single page element (drawn on a canvas, or several panels one back swipe should close together). Existing code works as before.

## 1.0.0 · API 1 · 2026-10-16
- First labeled version. Nothing in the code changed.

## Before version labels

- 2026-10-14: First version: the phone back swipe closes the top panel instead of leaving the page (CloseWatcher), cut from Apple Press 1.27.
- 2026-10-15: Added a connected check, a `close()` handle and an opt-in history fallback for browsers without CloseWatcher (such as iPhone Safari).
