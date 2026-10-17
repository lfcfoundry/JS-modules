# storage-probe

**Version 1.1.0 · API 1**

One page, one button. It tells you in plain words whether pages opened from **different files** on this device share their saved data (localStorage, locks, storage events). Save the page twice (another name or folder), open both, press the button in each.

Why it exists: the Story Editor and the games are single files that people keep in several folders. Whether two copies share one save, and whether one copy can tell the other is open, decides how the autosave, the one-window guard and every storage key must be designed. This tool answers it on the reader's own phone or computer, without a developer.

## What it reports
- Address type and origin. In Chromium the origin of a page opened from a file is the text `file://`, the same in every folder (measured 2026-10-17); other browsers may report `null`, which has not been checked.
- **Inside another page?** Whether the page is framed (as on a game site) and whether a test key written and read back works there. Browsers may keep a frame's saved data separate from the same page opened on its own (Chrome 115 and Firefox 103 and later, when the outer page is from another site), so a save made in a frame may be missing when the game is opened directly. The page only reports what it sees in its own setting; it cannot compare the framed and unframed storage in one run.
- Whether saving is allowed at all (private windows and blocked site data fail here).
- Whether this copy can read an entry another copy wrote ("Shared"), **how long ago** each other copy was last pressed (an old entry shows the saved data is shared, not that the other copy is open now), and a live note when another copy writes while this page is open (`storage` event, plus a `BroadcastChannel` reply).
- **Which copy is which:** copies are told apart by their address **without the part after `?` or `#`**. The same file opened with a different query or hash counts as one copy, not two. (Entries written by older versions of this page under a full address are folded in the same way.)
- Web Locks: whether another open copy holds the lock. A copy keeps the lock it took, so pressing the button again in the same copy says **"this copy holds the lock"**; only a lock held by a different copy reads "another copy is open".
- **IndexedDB:** the same question for IndexedDB (the Story Editor keeps its file memory there): "shared: this copy can see N other file(s) there too", or "nothing seen from other files yet".
- **This copy's own history:** on the second press it says how many times this copy was pressed before, when the first time was, and that its entry is still here, so saved data has survived since then (after a restart, an update or a week).
- Whether `CloseWatcher` exists (phone back swipe), space used and quota, and whether the browser keeps the data permanently.
- **Measure free saved-data space** (a separate button, because the search takes 0.5 to 1.8 seconds in Chromium): how many entries exist, the three largest, about how many characters are still free, and a reminder that pages sharing one bucket share one limit. It writes one temporary test entry and removes it again.
- **Save a second copy of this page** (a button): downloads `storage-probe-copy.html` straight from the page's own source, with the license header, so a phone user does not have to save the page twice by hand.
- A **Copy the report** button for sending the result to someone. The report appears once the asynchronous answers (lock, space, permanence) are in, or after 3 seconds at most, and is updated if a late answer arrives afterwards, so the copied text matches the screen.
- The verdict box is a status region (`role="status"`), so a screen reader announces the result.

## Measured
- **2026-10-14**, desktop Firefox 158 and Chromium: `file:` pages in different folders **share** localStorage, see each other's writes live and see each other's locks. Phones and other browsers may differ, which is the reason for the page.
- **2026-10-17**, Chromium 141 (headless): pages from different folders share **one bucket including its limit** of about 5.24 million characters. After page A wrote 1.5 million characters, page B saw the key and had only 3.74 million left. On a computer, all the games and the editor opened from files share that space, so one big save can leave another game with no room; each needs its own key prefix. `navigator.storage.persist()` answered `false` for a file page. Firefox, Windows and the Pixel are still unmeasured.

## Phone recipe (five steps)
1. Open `storage-probe.html` on the phone and press **Run the check**.
2. Press **Save a second copy of this page**.
3. Open `storage-probe-copy.html` from the phone's downloads.
4. Press **Run the check** in that copy.
5. Press **Copy the report** and paste it back.

The report prints the address type, so one run also tells whether the downloaded copy opened as `file://` or as `content://`, which is not known for the Pixel 7 Pro yet.

## Prior art
Browser-storage test pages (MDN's Web Storage demos, storage-quota checkers) show quota for one page. None found that compares two saved copies. Checked 2026-10-14; this is a small purpose-built tool.

## Limits
- Framed and unframed storage cannot be compared in a single run: open the page on its own, then inside the game site, and compare the two reports.
- The page does not test sessionStorage, cookies or the Cache API, and it does not ask the browser to keep data permanently. The free-space button finds the localStorage room to within about 1 KB; it is a measurement, not a promise.
- It cannot see copies opened in a different browser profile or a different browser (they have separate storage by design).
- `navigator.locks` sees only copies open right now.
- Only the verdict from pressing the button in **both** copies is conclusive: one copy alone can say only "nothing seen yet".
- The test writes one small entry, key `storage-probe:v1`.

## Test
`python3 tools/storage-probe/test/run.py [firefox|chromium]` (Playwright for Python). 26 checks, all passing in Chromium 141 (about 2 seconds: it waits for the page's own report instead of sleeping). They cover the second press in one copy, the same file with a different `?`/`#`, the age of stored entries, "inside another page: no", `role="status"`, and for 1.1.0 the IndexedDB line, the own-history line, the free-space button and the second-copy download (which is then opened from another folder and must report "Shared"). The page logic was also checked in Node with stand-in browser objects. Playwright's Firefox driver needs its own Firefox build; with a stock Firefox the test reports SKIPPED. Firefox 158 was checked by hand through the Story Editor's QA kit with the same two-folder steps.

## For AI agents
Single file, no dependencies. Copy `storage-probe.html` twice into different folders, open both over `file://`, click `#go` in each, read `#verdict` (text starts with `Shared`, `Nothing seen`, or `This browser would not let`). `window.__probe.run()` runs the check without the click. The report in `#report` is complete once `#copy` is visible; `#dl` downloads the second copy and `#space` measures the free space. Pressing the button again in the same copy is safe and reports the lock as held by this copy.

Copyright (c) 2026 LFC Foundry. MIT License.
