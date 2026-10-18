# wake-keeper changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-17
- New trimming tool writes a smaller copy without the parts a game does not use. The full file works as before.

## 1.0.0 · API 1 · 2026-10-16
- First labeled version. Nothing in the code changed.

## Before version labels

- 2026-10-14: First version: keeps the screen awake only while wanted; released on pause, hidden tab and idle, asked again when allowed.
- 2026-10-15: Fixed pause-then-resume before the browser answered, which left no screen lock: the stale lock is now released and a new one requested.
