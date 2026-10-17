# wake-keeper changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: Node: 42 checks pass (rerun 2026-10-17). navigator.wakeLock exists in Firefox 158.0 (feature check only). Not run: a real wake lock in any test browser, a phone

## Before version labels

- 2026-10-14: First version: keeps the screen awake only while wanted; released on pause, hidden tab and idle, asked again when allowed.
- 2026-10-15: Fixed pause-then-resume before the browser answered, which left no screen lock: the stale lock is now released and a new one requested.
