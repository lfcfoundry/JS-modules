# storage-probe

One page, one button. It tells you in plain words whether pages opened from **different files** on this device share their saved data (localStorage, locks, storage events). Save the page twice (another name or folder), open both, press the button in each.

Why it exists: the Story Editor and the games are single files that people keep in several folders. Whether two copies share one save, and whether one copy can tell the other is open, decides how the autosave, the one-window guard and every storage key must be designed. This tool answers it on the reader's own phone or computer, without a developer.

## What it reports
- Address type and origin (`file:` pages report origin `null`).
- **Inside another page?** Whether the page is framed (as on a game site) and whether a test key written and read back works there. Browsers may keep a frame's saved data separate from the same page opened on its own (Chrome 115 and Firefox 103 and later, when the outer page is from another site), so a save made in a frame may be missing when the game is opened directly. The page only reports what it sees in its own setting; it cannot compare the framed and unframed storage in one run.
- Whether saving is allowed at all (private windows and blocked site data fail here).
- Whether this copy can read an entry another copy wrote ("Shared"), **how long ago** each other copy was last pressed (an old entry shows the saved data is shared, not that the other copy is open now), and a live note when another copy writes while this page is open (`storage` event, plus a `BroadcastChannel` reply).
- **Which copy is which:** copies are told apart by their address **without the part after `?` or `#`**. The same file opened with a different query or hash counts as one copy, not two. (Entries written by older versions of this page under a full address are folded in the same way.)
- Web Locks: whether another open copy holds the lock. A copy keeps the lock it took, so pressing the button again in the same copy says **"this copy holds the lock"**; only a lock held by a different copy reads "another copy is open".
- Whether `CloseWatcher` exists (phone back swipe), space used and quota, and whether the browser keeps the data permanently.
- A **Copy the report** button for sending the result to someone. The report appears once the asynchronous answers (lock, space, permanence) are in, or after 3 seconds at most, and is updated if a late answer arrives afterwards, so the copied text matches the screen.
- The verdict box is a status region (`role="status"`), so a screen reader announces the result.

## Measured (2026-10-14)
Desktop Firefox 158 and Chromium: `file:` pages in different folders **share** localStorage, see each other's writes live and see each other's locks. Phones and other browsers may differ, which is the reason for the page.

## Prior art
Browser-storage test pages (MDN's Web Storage demos, storage-quota checkers) show quota for one page. None found that compares two saved copies. Checked 2026-10-14; this is a small purpose-built tool.

## Limits
- Framed and unframed storage cannot be compared in a single run: open the page on its own, then inside the game site, and compare the two reports.
- The page does not test IndexedDB, sessionStorage, cookies or the real size limit of localStorage.
- It cannot see copies opened in a different browser profile or a different browser (they have separate storage by design).
- `navigator.locks` sees only copies open right now.
- Only the verdict from pressing the button in **both** copies is conclusive: one copy alone can say only "nothing seen yet".
- The test writes one small entry, key `storage-probe:v1`.

## Test
`python3 tools/storage-probe/test/run.py [firefox|chromium]` (Playwright for Python). 14 checks. Chromium passed the original 8; the 6 added 2026-10-15 (second press in one copy says "this copy holds the lock", same file with a different `?`/`#` is one copy, age of stored entries, "inside another page: no", `role="status"`) have not been run in a browser yet. The page logic was also checked in Node with stand-in browser objects. Playwright's Firefox driver needs its own Firefox build; with a stock Firefox the test reports SKIPPED. Firefox 158 was checked by hand through the Story Editor's QA kit with the same two-folder steps.

## For AI agents
Single file, no dependencies. Copy `storage-probe.html` twice into different folders, open both over `file://`, click `#go` in each, read `#verdict` (text starts with `Shared`, `Nothing seen`, or `This browser would not let`). `window.__probe.run()` runs the check without the click. The report in `#report` is complete once `#copy` is visible. Pressing the button again in the same copy is safe and reports the lock as held by this copy.

Copyright (c) 2026 LFC Foundry. MIT License.
