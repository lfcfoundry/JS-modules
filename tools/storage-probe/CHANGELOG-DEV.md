# storage-probe developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-16

### Quick
The page now also checks IndexedDB, and has new buttons to measure free space and to save a second copy of the page.

### Deep
The page now also checks IndexedDB (the Story Editor keeps its file memory there), and on the second press it says how often and since when this copy was pressed and that its saved data survived. Two new buttons: Measure free saved-data space (how many entries, the biggest ones, how much room is left) and Save a second copy of this page (one press instead of saving the page twice by hand, handy on a phone). The test now waits for the page instead of sleeping, so a run takes about 2 seconds instead of 6 (5.7 s down to 1.7 s, about 70 percent less), and it has 12 more checks, 26 in all.

## 1.0.0 · API 1 · 2026-10-16

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.
