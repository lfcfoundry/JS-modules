# lz4-kit developer changelog

## 1.1.0 · API 1 · 2026-11-20

### Quick
Zero-copy view option and a laptop tester page.

### Deep
Owner asked to beat the wasm LZ4 rivals on speed (not size) and to test on a laptop. Profile (Node, Chromium 156): the compress call itself is about 7.3 ms of a 4 MiB block call; the copy in is 0.4 ms and the copy out of the result 0.5 to 2.5 ms (a fresh 4 MiB buffer costs page faults). Compiler flags did nothing: -O3 and -msimd128 against -O2 are inside the noise (7.1 to 7.5 ms compress), so the wasm build is unchanged. gorhill/lz4-wasm and lz4-wasm return views into their own memory, which is where the copy gap came from. New option `{ view: true }` (card "Add view option", 2026-11-20): the default copy path is untouched, so bytes and behavior stay the same; API number stays 1 because older callers are not affected. 8 new tests (942 in all): same bytes as the copy, the default stays a private copy and is not changed by later calls, empty or false options give the copy, damaged input still throws.
Measured with the tester page (medians of 3 pages, batches of 60 ms or more, 4 MiB logs): see the README. View compress 5.8 to 6.9 ms against gorhill 6.7 to 8.9, lz4-wasm 8.6 to 9.9; view decompress 1.5 to 1.7 against 3.4 to 4.2 (gorhill), 3.0 to 4.4 (wasm-lz4). Default copy: compress 7.2 to 7.3, decompress 2.1 to 3.8. Small calls (1024 x 4 KiB) widen the compress gap: 5.4 to 5.9 ms (view) against gorhill 11.8 to 21.7. Size work was dropped by the owner: LZ4 is expected to be bigger than gzip. The numbers page is now two charts (compress, decompress) in place of five.
Tester: loads the four other libraries from jsDelivr at pinned versions (gorhill/lz4-wasm has no release, so master, with a SHA-256 of each file in the results); swaps one bundler-only import line in lz4-wasm's published file; patches `fetch` for gorhill's same-origin request; passes in Chromium 156, Firefox 158 and WebKitGTK 2.52.6 with 64 checks each, and with the real CDN in Chromium. Rival code is not in this repository.
Not measured: phone, owner laptop.

## 1.0.0 · API 1 · 2026-11-19

### Quick
First release: LZ4 blocks and .lz4 frames in WebAssembly built from the fixed LZ4 1.11.1 release.

### Deep
New module on the owner's request (card "Fixed LZ4 build, ready to use", 2026-11-19; name lz4-kit chosen under the names rule, matching zstd-kit). Built from the LZ4 1.11.1 release tarball (SHA-256 checked in wasm/build.sh). The tarball's NEWS file for 1.11.1 says: `LZ4_resetStreamHC()` could write out of bounds at levels >= 10, on a state containing garbage (since v1.11.0). Checked here: this repo's other modules do not use liblz4 (lfc-pack embeds Zstandard; memory-compression has its own LZ4-style coder), so nothing in JS-modules was affected; lz4-kit is for people who want the fixed library in a page.
Layout follows zstd-kit: wasm/lz4-glue.c (allocator and exports, plus a compress_hc_stream export that runs the 1.11.0 bug's call on a dirty state), wasm/stubs, wasm/build.sh, src/head.js + src/api.js joined by build.py into lz4-kit.js (wasm embedded as base64). No change to the LZ4 sources.
Tests (test/run.js, 934 checks, about 4 s): round trips for blocks and frames at 9 sizes, 3 data kinds and levels 0 to 12; an independent decoder written from the format spec (block decoder, frame parser, XXH32 content checksum); levels 9 to 12 on a stream state filled with different bytes must give the same output; concatenated frames; every error path.
Measured (cloud, Chromium 156, Firefox 158, WebKitGTK 2.52.6): see the README table. Rivals (owner's install card, scratch folder only): lz4js 0.2.0 is 1.2 to 1.7 times slower to compress and 2.6 to 3.1 times slower to decompress; lz4-wasm 0.9.2 is a tie within noise (its own block format, no levels). gorhill/lz4-wasm (master, 2026-11-19) wasm flavor is a tie to slightly faster than the kit's block calls (the kit copies its output); its JS flavor is 1.4 to 2 times slower; wasm-lz4 2.0.0 (decompress only) ties the kit's frame decompress. Not measured: phone, owner laptop.

Measured (private changelog numbers): First release. New module on the owner's request (card, 2026-11-19). LZ4 1.11.1 compiled unchanged (SHA-256 checked); 934 checks including an independent decoder and the 1.11.0 dirty-state case at levels 9 to 12. 4 MB log lines, fresh page, median of 3, Chromium 156 / Firefox 158 / WebKitGTK 2.52.6: fast compress 11.6 / 10.9 / 13 ms against browser gzip 41.8 / 39.3 / 51; decompress 4.8 / 5.4 / 6 against 8.5 / 10.4 / 14; fast frame 955,395 bytes against gzip 511,510 to 549,465. Not measured: rival LZ4 libraries (install card pending), phone, laptop.
