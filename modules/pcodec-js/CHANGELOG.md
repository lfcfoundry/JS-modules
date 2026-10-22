# pcodec-js changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.2.0 · API 1 · 2026-10-22
- New PcodecJS.pool() shares packing and unpacking across several background workers. Packing one 2,000,000-number column took 129 to 142 ms on one worker and 58 to 80 ms on the better of 2 or 4 workers (1.7 to 2.2 times less time, lower is better); unpacking 96 columns took 107 to 119 ms and now 50 to 103 ms. A big column packed on several workers comes out as exactly the same file pack() writes. Small jobs stay on one worker.

## 1.1.0 · API 1 · 2026-10-18
- Big unpacks no longer freeze the page: unpackAsync() unpacks in 2 ms slices (frozen 47 to 156 ms for 2,000,000 numbers before, now 3 to 6 ms).
- New PcodecJS.worker() does unpack and pack in a background worker (a pack froze the page 169 to 207 ms, now 5 to 8 ms).
- The program compiles the moment the file runs, so load() is ready at once (the wait was 7 to 17 ms, now under 1 ms).

## 1.0.1 · API 1 · 2026-10-18
- No change to the code or to the files it writes. The build was rebuilt and checked again, and the credits and comparison were updated.

## 1.0.0 · API 1 · 2026-10-18
- First release as its own module: Pcodec, a number compressor, for web pages in one file with no build step. It needs WebAssembly.
