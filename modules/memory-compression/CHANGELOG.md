# memory-compression changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

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
