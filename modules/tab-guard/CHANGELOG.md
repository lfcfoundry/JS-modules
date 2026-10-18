# tab-guard changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-17
- New option so pressing Back restores the game from the browser's cache and it stays in charge, where Firefox used to reload it. Off unless you ask.

## 1.0.0 · API 1 · 2026-10-16
- First labeled version. Nothing in the code changed.

## Before version labels

- 2026-10-14: First version: one open copy of a game at a time (Web Locks), cut from Apple Press 1.27.
- 2026-10-15: Only an `AbortError` now counts as another copy taking over; other lock errors no longer switch saving off.
