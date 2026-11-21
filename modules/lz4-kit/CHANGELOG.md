# lz4-kit changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.1.2 · API 1 · 2026-11-21
- Default-speed .lz4 frames of 64 KiB and more are 23 to 26% faster and 12% smaller on 4 MiB of logs: 6.3 to 6.4 ms against 8.5 before (Chromium 156, Firefox 158, WebKitGTK 2.52.6). Still a standard frame with size and checksum.

## 1.1.1 · API 1 · 2026-11-20
- Default-speed blocks of data that packs well (64 KiB and more per call) compress 20 to 22% faster and 6 to 12% smaller: 4 MiB of logs in 5.2 to 5.5 ms against 7.3 to 9.5 for gorhill/lz4-wasm (Chromium 156, Firefox 158, WebKitGTK 2.52.6).
- Data that packs poorly, calls under 64 KiB, levels 1 to 12 and frames are unchanged. Same API, standard LZ4 blocks.

## 1.1.0 · API 1 · 2026-11-20
- New last argument `{ view: true }` on the compress and decompress calls: no copy, valid until the next call. 4 MiB of logs: decompress 1.5 to 1.7 ms against 3.0 to 4.4 for other LZ4 libraries (Chromium 156, Firefox 158, WebKitGTK 2.52.6).
- New test page `bench/laptop-tester.html`: speed against gzip and four other LZ4 libraries, plus cross-reading checks, with a Copy results button.

## 1.0.0 · API 1 · 2026-11-19
- LZ4 blocks and .lz4 frames in WebAssembly, from the fixed LZ4 1.11.1; levels 1 to 12. 4 MB of logs: 3.6 to 3.9 times faster than browser gzip in Chromium 156, Firefox 158, WebKitGTK 2.52.6, but 1.7 to 1.9 times bigger.
