# zip-open changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.2.0 · API 1 · 2026-10-18
- Checking big files is about 1.3 to 1.7 times faster using a small WebAssembly checksum (same answers). Pages with a content policy need 'wasm-unsafe-eval'; without it the old code is used.

## 1.1.0 · API 1 · 2026-10-17
- The check on every unpacked file is about 3.9 times faster, so large zips open sooner. Same answers.

## 1.0.0 · API 1 · 2026-10-17
- New module: opens .zip and Excel .xlsx files in the browser or in Node with no libraries, with every problem reported in plain words. Zip bombs are refused quickly.
