# storage-probe

One page, one button. It tells you in plain words whether pages opened from **different files** on this device share their saved data (localStorage, locks, storage events). Save the page twice (another name or folder), open both, press the button in each.

Why it exists: the Story Editor and the games are single files that people keep in several folders. Whether two copies share one save, and whether one copy can tell the other is open, decides how the autosave, the one-window guard and every storage key must be designed. This tool answers it on the reader's own phone or computer, without a developer.

## What it reports
- Address type and origin (`file:` pages report origin `null`).
- Whether saving is allowed at all (private windows and blocked site data fail here).
- Whether this copy can read an entry another copy wrote ("Shared"), and a live note when another copy writes while this page is open (`storage` event, plus a `BroadcastChannel` reply).
- Web Locks: whether another open copy holds the lock.
- Whether `CloseWatcher` exists (phone back swipe), space used and quota, and whether the browser keeps the data permanently.
- A **Copy the report** button for sending the result to someone.

## Measured (2026-10-14)
Desktop Firefox 158 and Chromium: `file:` pages in different folders **share** localStorage, see each other's writes live and see each other's locks. Phones and other browsers may differ, which is the reason for the page.

## Prior art
Browser-storage test pages (MDN's Web Storage demos, storage-quota checkers) show quota for one page. None found that compares two saved copies. Checked 2026-10-14; this is a small purpose-built tool.

## Limits
- It cannot see copies opened in a different browser profile or a different browser (they have separate storage by design).
- `navigator.locks` sees only copies open right now.
- Only the verdict from pressing the button in **both** copies is conclusive: one copy alone can say only "nothing seen yet".
- The test writes one small entry, key `storage-probe:v1`.

## Test
`python3 tools/storage-probe/test/run.py [firefox|chromium]` (Playwright for Python). 8 checks, Chromium passes. Playwright's Firefox driver needs its own Firefox build; with a stock Firefox the test reports SKIPPED. Firefox 158 was checked by hand through the Story Editor's QA kit with the same two-folder steps.

## For AI agents
Single file, no dependencies. Copy `storage-probe.html` twice into different folders, open both over `file://`, click `#go` in each, read `#verdict` (text starts with `Shared`, `Nothing seen`, or `This browser would not let`). `window.__probe.run()` runs the check without the click.
