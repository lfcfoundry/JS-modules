# save-kit changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.4.0 · API 1 · 2026-10-31
- New durable option keeps a second copy of each save that survives a browser crash. In a real crash test, saves kept only in browser storage lost 29 to 30 of 80; with durable on, none were lost.

## 1.3.1 · API 1 · 2026-10-30
- Loads with a raw field are 2 to 3 times faster (same clean state): parsed objects are used as they are when the text names no __proto__, constructor or prototype key.

## 1.3.0 · API 1 · 2026-10-30
- New SaveKit.createLarge(): big saves in IndexedDB with a backup slot and an optional cross-tab lock. Up to 4x faster than idb-keyval and localForage on 16 MB; slower in a few cases (README). create() is unchanged.

## 1.2.2 · API 1 · 2026-10-27
- A zero limit in a schema now means zero: max 0 or maxKeys 0 rejects nonempty text and count entries.

## 1.2.1 · API 1 · 2026-10-17
- Loading and saving is a little faster. Nothing a game sees changes.

## 1.2.0 · API 1 · 2026-10-17
- Six new options (all off unless given) so a game with saves already in the wild can move to save-kit, including support for old save-code endings.

## 1.1.0 · API 1 · 2026-10-17
- Two fixes: default values are now copied for each state, and a default for counts is used when the field is missing.
- Loading is about a third faster or more.

## 1.0.0 · API 1 · 2026-10-16
- First labeled version. Nothing in the code changed.

## Before version labels

- Early October 2026: First version: safe saves with a backup slot, and checksummed copy-paste save codes.
- 2026-10-15: Pasted save codes now have a length limit and a limit on what they may unpack to (before, a short paste could unpack to 100 MB).
- 2026-10-15: A save with one bad number keeps its good parts instead of being thrown away; a new on-by-default setting loads as on; a blocked or broken `localStorage` no longer stops the game from starting.
- 2026-10-16: README: documented `pause()` and `forceBackupNext()`.
