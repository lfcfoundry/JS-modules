# memory-compression changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 2.10.3 · API 2 · 2026-11-01
- view() also opens number and text columns inside nested records and lists block by block: the first row is ready 1.6 to 14 times as fast (38 to 93% less time) on such lists; same results.

## 2.10.2 · API 2 · 2026-11-01
- view() opens a long list much faster: the first row is ready 1.3 to 16 times as fast (21 to 94% less time), because number and dictionary columns are decoded only where a row is read.

## 2.10.1 · API 2 · 2026-10-31
- Starts a little faster: the built-in WebAssembly program is decoded by the browser's own base64 decoder (Uint8Array.fromBase64) in 0.08 to 0.18 of the old time (cloud tests); older browsers use the old way. Same bytes.

## 2.10.0 · API 2 · 2026-10-31
- New unpack option into: pass the typed array you got last time to read the next one without fresh memory (9 to 30% less time on a laptop for big number arrays).

## 2.9.0 · API 2 · 2026-10-31
- New opt-in stream rows for unpackAsync: long lists arrive a page at a time and never hold every row. 300,000 rows: 0.60 of the time in laptop Chromium, 0.82 in Firefox, pauses 2 to 4x shorter.

## 2.8.2 · API 2 · 2026-10-31
- view() stays lazy on pages that forbid eval (our policy): opening a view and reading a row takes 34 to 80% less time, same rows. Lists that are mostly numbers are unchanged.

## 2.8.1 · API 2 · 2026-10-31
- After the idle trim, the two small wasm helpers are made again at once (about 6 MB held), so the first pack after a pause is as fast as the rest.

## 2.8.0 · API 2 · 2026-10-31
- Packing lists of whole numbers (up to 100,000 rows) is 2 to 24% faster; files can be up to about 1% bigger. autoTries: false keeps the old bytes.

## 2.7.0 · API 2 · 2026-10-30
- New opt-in setting quickTries: true tries every number coding on the first block only: packing 0 to 20% faster on lists with number columns, files 0 to 1.1% bigger. Off by default; default output byte-identical.

## 2.6.6 · API 2 · 2026-10-30
- Opening balanced or small packed columns is 2 to 12% faster; same rows, same bytes

## 2.6.5 · API 2 · 2026-10-26
- Fixed: nested rows whose key names contain a control character could get another row shape's field names.

## 2.6.4 · API 2 · 2026-10-24
- Column pages keep nested objects, arrays, coordinate pairs and date-time columns in pieces and make each value when its row is read: scene-item page memory 312 to 148 KB, page open up to 2x faster; reading every row is 80 to 300 ns slower.

## 2.6.3 · API 2 · 2026-10-24
- unpackAsync() now opens number columns written by the number picker a few blocks at a time, so a long coordinate column no longer holds the page for 15 to 25 ms; same values, same packed bytes, unpack() unchanged.

## 2.6.2 · API 2 · 2026-10-23
- Packing lists is a little faster in balanced mode for many list shapes (up to about 12% on event and map-feature lists); packed bytes are the same.

## 2.6.1 · API 2 · 2026-10-23
- pack() writes into one output buffer it keeps instead of a new array for every 1 MiB piece, so a big pack leaves less garbage; freeBuffers() and a 2 s idle spell release the buffer. Same bytes out.

## 2.6.0 · API 2 · 2026-10-23
- unpackAsync takes an optional onRows(rows, from, to), called after each slice of a long record list so a page can use the first rows early; first rows 14 to 49% sooner on 60,000 links, whole call unchanged.

## 2.5.1 · API 2 · 2026-10-23
- Packing a long number column now tries every way on every 8th block instead of every 4th: 30,000 scene items pack 4 to 10% faster (balanced), 60,000 links 4 to 5%; packed size within 0.2%. No format change.

## 2.5.0 · API 2 · 2026-10-23
- Column pages hold text lazily: page open up to 45% faster, held text columns 62 to 89% smaller; a column read row by row is made in one pass, so reading rows costs about what it did in 2.4.9; memory report counts text and nested data.

## 2.4.10 · API 2 · 2026-10-23
- Pages that forbid generated code now save lists of records faster (fast pack of 60,000 links 15 to 32% shorter; balanced up to 16%). pool.start() returns a promise that resolves when the workers are warm. Same bytes and format.

## 2.4.9 · API 2 · 2026-10-23
- 2.4.9: packAsync and unpackAsync yield only when a slice is used up: total time 0.95 to 1.4x of pack/unpack (was up to 3.3x in WebKit); cold pager reads 66 to 94% cheaper; no-eval pages open up to 2.6x faster; pool.start() primes.

## 2.4.7 · API 2 · 2026-10-23
- New opt-in warm(): call it at idle and it packs and opens a made-up 1,200-row list in 18 short tasks, so the first big pack is 12 to 39 ms faster (log events, four browsers). Costs 32 to 65 ms at idle. No format change.

## 2.4.6 · API 2 · 2026-10-23
- 2.4.6: new opt-in unpackAsync() opens a long packed list in short slices so the page stays free, same value as unpack(); page held 2 to 8 ms instead of 8 to 26, but total time 1.0 to 2.4x longer (most in WebKit). No new policy need.

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
