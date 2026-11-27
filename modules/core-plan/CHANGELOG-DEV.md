# core-plan developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-11-26
- Quick: new module. `plan()`, `detect()`, `lastRun`.
- Details: workers = min(cores - keepFree, half of memory / workerMB, 8), at least 1; cores = threads / 2 from 8 threads up. 1,809 Node checks; browser check passes in ungoogled Chromium 156, Firefox 158 and WebKitGTK 2.52.6.
- Deep: drafted by the tester sweep (2026-11-26) after a tester with a fixed 15-helper sweep crashed Firefox on a 4-core, 8-thread laptop.
