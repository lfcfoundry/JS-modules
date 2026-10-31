# speed-guard developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-22

### Quick
New: one command that flags any release step more than 5% slower than the release before, and lists the browser checks a change needs re-run.

### Deep
New tool. speed-guard reads the speed-history files, compares the newest release of every (test, browser) with the one before it, direction-aware, and marks anything more than 5% worse as SLOWER (a step within 1 ms is a tie, because Firefox and WebKit read whole milliseconds). Exit 1 on SLOWER, so it can gate a merge; --ok lists slowdowns the owner accepted. --plan lists the browser checks the changed files affect, using the picker in tests/kits.js, and the command to run only those. It runs nothing itself: zero browser time. On the 2026-10-22 speed history it compared 120 steps in under a second (67 faster, 25 level or tie, 28 SLOWER, mostly Netflow Map steps whose rows trade speed for another goal). 9 checks pass.
