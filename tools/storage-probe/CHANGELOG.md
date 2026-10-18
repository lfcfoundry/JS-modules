# storage-probe changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-16
- The page now also checks IndexedDB, and has new buttons to measure free space and to save a second copy of the page.

## 1.0.0 · API 1 · 2026-10-16
- First labeled version. Nothing in the code changed.

## Before version labels

- 2026-10-14: First version: a one-button page that tells you whether copies of a page in different folders share saved data, locks and storage events.
- 2026-10-15: Pressing the button twice no longer falsely reports that another copy holds the lock; added a line for pages opened inside a frame.
