# tab-guard developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.1.1 · API 1 · 2026-10-24

### Quick
Notes now say copies opened from a phone's Files app also share locks, so pick a unique lock name. No code change.

### Deep
Shipped in JS-modules PR 161 (merged 2026-10-24).
Documentation only. The owner's phone run of storage-probe 1.1.0 (Android, Chrome 155, two copies opened from the Files app as content:// addresses with different paths) showed the two copies share one lock space (the page reported the lock held by another open copy), one localStorage and one IndexedDB. README limits now say so and tell games to use a name nobody else uses.

## 1.1.0 · API 1 · 2026-10-17

### Quick
New option so pressing Back restores the game from the browser's cache and it stays in charge, where Firefox used to reload it. Off unless you ask.

### Deep
New option backForwardCache: true (off by default, so nothing changes unless you ask). Pressing Back in Firefox 158.0 reloaded the whole game 3 of 3 times because a held lock keeps a page out of the back/forward cache; with the option it is restored from the cache 3 of 3 and is still in charge. In WebKitGTK 2.52.6 and GNOME Web 46.5 the cached page lost its lock and wrongly heard onTwin then onFree 3 of 3 times; with the option it stays in charge 3 of 3, with no false twin. Chromium 155 was already fine (restored 3 of 3). The lock is given up when the page is left and taken again on return, or after returnMs (default 1000); a copy opened in that gap wins and the returning page becomes the twin once. Added 7 checks (22 to 29). Minified size 2,141 to 2,769 bytes (958 to 1,154 gzip).

## 1.0.0 · API 1 · 2026-10-16

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.
