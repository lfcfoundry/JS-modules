# memory-compression changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 2.4.3 · API 2 · 2026-10-23
- 2.4.3: new opt-in packAsync() packs a long list without freezing the page, same bytes as pack(); 60,000 rows balanced: 85 to 117 ms as one task, 54 to 83 ms total, longest page task 6 to 9 ms. Slower in a few short-list and fast-mode cells.

## 2.4.2 · API 2 · 2026-10-23
- 2.4.2: pager() can repack pages nobody is reading 15 to 18% smaller in a background worker, by itself when idle or before moving them to storage (needs worker-src blob: in the page's security policy).

## 2.4.1 · API 2 · 2026-10-22
- 2.4.1: pager() can keep open pages as columns; for lists of numbers that halves the memory of an open page and opens it about 2 to 3 times faster.

## 2.4.0 · API 2 · 2026-10-22
- 2.4.0: after a big pack the module gives its spare memory back by itself once the page is quiet for 2 seconds.

## 2.3.5 · API 2 · 2026-10-22
- 2.3.5: lists with coordinate pairs and other arrays inside rows (map features, routes) open up to about 25% faster in Firefox, WebKitGTK and GNOME Web; level in Chromium; no change to files.

## 2.3.4 · API 2 · 2026-10-22
- 2.3.4: a pager in balanced mode builds its pages up to about 25% faster; packed size grows by under 1%.

## 2.3.3 · API 2 · 2026-10-22
- 2.3.3: packing a long list in pager() is 15 to 30% faster (60,000 rows: Chromium 40 to 31 ms, Firefox 61 to 45, WebKitGTK 54 to 39, GNOME Web 47 to 38). Same bytes.

## 2.3.2 · API 2 · 2026-10-22
- 2.3.2: pager() now also reads ahead when rows are read backward, so the first read of each new page costs nothing instead of 0.5 to 1 ms.

## 2.3.1 · API 2 · 2026-10-22
- 2.3.1: the automatic page length is never longer than the old 2,048-row default, so thin rows no longer open slower in Firefox.

## 2.3.0 · API 2 · 2026-10-22
- pager() can pick its own page size, open pages and mode from the list and the device's memory (pageRows, livePages and mode set to 'auto', or pager.plan()). Nothing changes unless you ask for it.

## 2.2.0 · API 2 · 2026-10-22
- New pager(): keeps a long list packed in pages. One object opens in 0.4 to 3 ms instead of 6 to 50 ms, idle pages leave memory or move to browser storage, and a list packs in the background without a freeze.

## 2.1.2 · API 2 · 2026-10-22
- Balanced and small packing of number columns is a little faster (up to about 15% on some whole-number columns); no change to file size on disk.

## 2.1.1 · API 2 · 2026-10-22
- Lists with a lot of text pack up to about 15% faster in Chrome-based and Safari-based browsers; no change to file size on disk.

## 2.1.0 · API 2 · 2026-10-18
- Balanced and small mode open 7 to 32% faster and pack 6 to 18% faster in all four test browsers (same files); WebAssembly starts compiling when the file loads.

## 2.0.4 · API 2 · 2026-10-18
- Text such as dates (2025-03-04T05:15:00Z) opens up to 2 times faster in fast mode; no change to file size on disk.

## 2.0.3 · API 2 · 2026-10-18
- Saves about 5.8 MB of memory on pages that load the module but never pack anything. The first pack takes a few milliseconds longer.

## 2.0.2 · API 2 · 2026-10-18
- Two bugs fixed: asking how much memory a list uses no longer fails when some rows are missing a text value, and a page that only allows WebAssembly no longer logs a blocked-code error.

## 2.0.1 · API 2 · 2026-10-18
- Opening a file in fast mode is 21% to 65% faster in Firefox, WebKitGTK and GNOME Web when files of other modes are open on the same page. Packed files are identical.

## 2.0.0 · API 2 · 2026-10-17
- Two modules became one file with one pack and unpack that choose the right method for you. A page that used both now ships about a quarter less code.
