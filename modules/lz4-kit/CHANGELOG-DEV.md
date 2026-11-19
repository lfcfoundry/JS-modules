# lz4-kit developer changelog

## 1.0.0 · API 1 · 2026-11-19

### Quick
First release: LZ4 blocks and .lz4 frames in WebAssembly built from the fixed LZ4 1.11.1 release.

### Deep
New module on the owner's request (card "Fixed LZ4 build, ready to use", 2026-11-19; name lz4-kit chosen under the names rule, matching zstd-kit). Built from the LZ4 1.11.1 release tarball (SHA-256 checked in wasm/build.sh). The tarball's NEWS file for 1.11.1 says: `LZ4_resetStreamHC()` could write out of bounds at levels >= 10, on a state containing garbage (since v1.11.0). Checked here: this repo's other modules do not use liblz4 (lfc-pack embeds Zstandard; memory-compression has its own LZ4-style coder), so nothing in JS-modules was affected; lz4-kit is for people who want the fixed library in a page.
Layout follows zstd-kit: wasm/lz4-glue.c (allocator and exports, plus a compress_hc_stream export that runs the 1.11.0 bug's call on a dirty state), wasm/stubs, wasm/build.sh, src/head.js + src/api.js joined by build.py into lz4-kit.js (wasm embedded as base64). No change to the LZ4 sources.
Tests (test/run.js, 934 checks, about 4 s): round trips for blocks and frames at 9 sizes, 3 data kinds and levels 0 to 12; an independent decoder written from the format spec (block decoder, frame parser, XXH32 content checksum); levels 9 to 12 on a stream state filled with different bytes must give the same output; concatenated frames; every error path.
Measured (cloud, Chromium 156, Firefox 158, WebKitGTK 2.52.6): see the README table. Not measured: rival libraries (waiting on the owner's install card), phone, owner laptop.

Measured (private changelog numbers): First release. New module on the owner's request (card, 2026-11-19). LZ4 1.11.1 compiled unchanged (SHA-256 checked); 934 checks including an independent decoder and the 1.11.0 dirty-state case at levels 9 to 12. 4 MB log lines, fresh page, median of 3, Chromium 156 / Firefox 158 / WebKitGTK 2.52.6: fast compress 11.6 / 10.9 / 13 ms against browser gzip 41.8 / 39.3 / 51; decompress 4.8 / 5.4 / 6 against 8.5 / 10.4 / 14; fast frame 955,395 bytes against gzip 511,510 to 549,465. Not measured: rival LZ4 libraries (install card pending), phone, laptop.
