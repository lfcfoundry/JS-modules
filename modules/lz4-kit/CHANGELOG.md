# lz4-kit changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-11-20
- New last argument `{ view: true }` on the compress and decompress calls: no copy, valid until the next call. 4 MiB of logs: decompress 1.5 to 1.7 ms against 3.0 to 4.4 for other LZ4 libraries (Chromium 156, Firefox 158, WebKitGTK 2.52.6).
- New test page `bench/laptop-tester.html`: speed against gzip and four other LZ4 libraries, plus cross-reading checks, with a Copy results button.

## 1.0.0 · API 1 · 2026-11-19
- LZ4 blocks and .lz4 frames in WebAssembly, from the fixed LZ4 1.11.1; levels 1 to 12. 4 MB of logs: 3.6 to 3.9 times faster than browser gzip in Chromium 156, Firefox 158, WebKitGTK 2.52.6, but 1.7 to 1.9 times bigger.
