# zip-open changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.10.0 · API 1 · 2026-10-31
- Excel files open much faster again: 1.9 to 3.6 times as fast (48 to 72% less time) than 1.9.0 (whole open, cloud Firefox, Chromium, WebKitGTK), same results. Fixed: two big zips opened at once with helpers could leave one never finishing.

## 1.9.0 · API 1 · 2026-10-31
- Excel files are read faster again: 6 to 31% faster than 1.8.0 in cloud tests of Firefox, Chromium and WebKitGTK, with the same results.

## 1.8.0 · API 1 · 2026-10-31
- Excel files are read much faster: 1.8 to 3.3 times as fast (45 to 70% less time) in cloud tests of Firefox, Chromium and WebKitGTK, with the same results. Sheets with formulas and sheets full of text gain the most.

## 1.7.0 · API 1 · 2026-10-31
- Excel sheets are read faster: on a 16-core laptop 11 to 20% faster in Firefox and 23 to 24% faster in Chromium, with the same results.

## 1.6.0 · API 1 · 2026-10-31
- Text entries are unpacked into one shared buffer that is reused for the next entry (let go 5 s after the last one). Laptop Chromium: 2 to 14% faster on most zips; laptop Firefox: about even.

## 1.5.2 · API 1 · 2026-10-31
- Loading the module costs what it did before 1.5.0: the small-file unpacker is now a separate piece, prepared only when a small file is first opened. 2,000 tiny files still open 1.4 to 1.9x faster than with the browser's own unpacker.
- Helpers from expandBlob close 5 s after their last use and give their memory back (idleMs changes the delay).

## 1.5.1 · API 1 · 2026-10-30
- Opening a zip file of up to 16 MB from a File is faster again (0.80 to 0.93x the time), now as fast as the older in-memory open.

## 1.5.0 · API 1 · 2026-10-30
- Faster: entries of 4 KB or less (compressed) are unpacked by a small WebAssembly inflate, about 1.5 to 2.2 times as fast for thousands of tiny files. Module grows by 9.4 KB of WebAssembly. Same files, same notes.

## 1.4.0 · API 1 · 2026-10-30
- New: `expandBlob`, `listBlob` and `readBlob` open a File or Blob in pieces, so a big zip never has to sit whole in memory. Same files, same notes.
- New: `{ workers: n }` unpacks big entries (2 MB and up) side by side in Web Workers: about 1.2 to 1.8 times as fast on a zip of several big files. Off by default.
- Checks: 700 damaged zips give the same answer from a File as from memory.

## 1.3.1 · API 1 · 2026-10-26
- Fixed: a zip comment that contains end-record bytes no longer replaces the real directory; zips with extra bytes after the end record still open.

## 1.3.0 · API 1 · 2026-10-22
- The WebAssembly checksum now starts compiling in the background when the file loads; adds wasmReady() and wasmModule().

## 1.2.0 · API 1 · 2026-10-18
- Checking big files is about 1.3 to 1.7 times faster using a small WebAssembly checksum (same answers). Pages with a content policy need 'wasm-unsafe-eval'; without it the old code is used.

## 1.1.0 · API 1 · 2026-10-17
- The check on every unpacked file is about 3.9 times faster, so large zips open sooner. Same answers.

## 1.0.0 · API 1 · 2026-10-17
- New module: opens .zip and Excel .xlsx files in the browser or in Node with no libraries, with every problem reported in plain words. Zip bombs are refused quickly.
