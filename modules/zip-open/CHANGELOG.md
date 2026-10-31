# zip-open changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

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
