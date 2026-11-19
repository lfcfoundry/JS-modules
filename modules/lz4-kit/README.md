# lz4-kit

**Version 1.0.0 · API 1**

**Tested in:** ungoogled Chromium 156, Firefox 158, WebKitGTK 2.52.6; Node 22 (tests)

Part of [JS-modules](../../README.md). MIT License, Copyright (c) 2026 LFC Foundry. The WebAssembly inside is LZ4 1.11.1 (BSD-2-Clause, see [NOTICE-lz4.txt](NOTICE-lz4.txt)).

## What it is and how it works

LZ4 compression and decompression in the browser and in Node, from one WebAssembly build of the official LZ4 library, version 1.11.1. It reads and writes raw LZ4 blocks and the standard `.lz4` frame (the format of the `lz4` command and of LZ4 frames in other tools). `lz4-kit.js` is one file (48.2 KB gzipped, the WebAssembly is inside as text).

- `await Lz4Kit.init()` once. It compiles the WebAssembly, which took 5 to 13 ms in the test browsers.
- `Lz4Kit.compress(bytes, level)` gives one `.lz4` frame that records the content size and a content checksum. `level` is 0 (fast mode, the default) or 1 to 12 (high compression, slower and smaller).
- `Lz4Kit.decompress(frame, size)` returns the original bytes. Frames written one after another are joined. `size` is optional.
- `Lz4Kit.compressBlock(bytes, level, acceleration)` and `Lz4Kit.decompressBlock(block, size)` work on a raw block with no header. A block does not record its size, so `decompressBlock` needs it. `acceleration` (level 0 only) trades size for speed.
- Every call takes a Uint8Array, another typed array, an ArrayBuffer or a string (encoded as UTF-8).

**Why release 1.11.1.** LZ4 1.11.0 had an out-of-bounds write in `LZ4_resetStreamHC()` at high compression levels (10 and up) on a state holding garbage; 1.11.1 fixes it (the release notes, in the `NEWS` file inside the tarball, say "since v1.11.0"). 1.11.0 also fixed several cases of data corruption in valid use (ring buffer decoding, rare cases of streaming or `destSize` compression), so 1.11.1 has those fixes too. This module is built from 1.11.1 only, from the release tarball checked by SHA-256, with no change to the LZ4 sources.

## Why it exists

Browsers have gzip and deflate built in (`CompressionStream`), but not LZ4. LZ4 is what you pick when speed matters more than size: its decoder is very fast and its fast mode compresses several times faster than gzip. Files and streams from tools that use LZ4 (`.lz4` files, the LZ4 codec in Parquet files, Arrow IPC, Kafka, game and cache data) need a reader in the page, and a page that wants to write them needs a writer. This module gives both from the fixed release, with tests that include the case the 1.11.0 bug was in.

**Where it helps**

- Reading and writing `.lz4` files and LZ4 blocks in a page or worker.
- Fast, light compression of big in-memory data when gzip is too slow.

**Not for:** small pages that only need gzip; use `CompressionStream`, which costs no download. Streams larger than memory are not supported: a whole frame goes in and comes out at once. It is not a general replacement for Zstandard when size matters most; see [zstd-kit](../zstd-kit/README.md).

## Use

```js
await Lz4Kit.init();
const frame = Lz4Kit.compress(new TextEncoder().encode(text));       // Uint8Array, a standard .lz4 frame
const back = new TextDecoder().decode(Lz4Kit.decompress(frame));
const small = Lz4Kit.compress(bytes, 9);                              // slower, smaller
const block = Lz4Kit.compressBlock(bytes);                            // raw block: keep bytes.length yourself
const again = Lz4Kit.decompressBlock(block, bytes.length);
```

Call `release()` after a big job to free the working memory. WebAssembly memory itself never shrinks.

## Numbers and how it compares

These numbers come from 4 MB of made-up web-server log lines (JSON, 4,194,304 bytes; the page and its generator are in bench/bench.html), on a fresh page each time, as the median of 3 pages. Each call ran 5 times on the page; the table shows the middle of the last 4 (steady) and the first call where noted. Times are in ms. "Browser gzip" is the page's own `CompressionStream` and `DecompressionStream`, median of 3 calls.

| | ungoogled Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---|---|---|
| **lz4-kit compress, fast (level 0)** | **11.6** | **10.9** | **13** |
| lz4-kit compress, fast, first call | 18.8 | 19.4 | 32 |
| browser gzip, compress | 41.8 | 39.3 | 51 |
| **lz4-kit compress, level 9** | 110.7 | 122.2 | 111 |
| **lz4-kit compress, level 12** | 264.6 | 288.6 | 275 |
| **lz4-kit decompress, fast frame** | **4.8** | **5.4** | **6** |
| lz4-kit decompress, fast frame, first call | 8.9 | 7.5 | 10 |
| browser gzip, decompress | 8.5 | 10.4 | 14 |
| `init()` (compile) | 5.4 | 13.2 | 9 |

Sizes in bytes for the same data (4,194,304 bytes in): fast frame 955,395; level 9 frame 664,534; level 12 frame 646,725; raw block at level 0 954,438; browser gzip 511,510 (Chromium), 549,465 (Firefox), 542,370 (WebKitGTK).

- **Where it wins:**
  - Fast-mode compression is 3.6 to 3.9 times faster than the browser's gzip in all three browsers.
  - Decompression is 1.8 to 2.3 times faster than the browser's gzip.
  - It reads and writes the standard `.lz4` frame and raw blocks, with high-compression levels up to 12, from the fixed release.
- **Where it loses:**
  - Size: on these logs the fast frame is 1.7 to 1.9 times the size of gzip, and level 12 is still 18 to 26% bigger than gzip. LZ4 trades size for speed.
  - Download size: the file is 48.2 KB gzipped; the browser's gzip is free.
  - Compression at levels 9 to 12 takes 110 to 290 ms for 4 MB, slower than gzip here.
- **Against other LZ4 libraries in the browser** (same 4 MB, fast mode, fresh page, median of 3 pages; page `bench/rivals.html`; latest npm releases lz4js 0.2.0 and lz4-wasm 0.9.2, both checked with `npm view` on 2026-11-19). Times in ms, steady (middle of the last 4 of 5 calls), then the first call in brackets:

| | ungoogled Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---|---|---|
| **lz4-kit compress** | 9.8 (19.5) | 9.5 (19.3) | 11 (17) |
| lz4-wasm 0.9.2 compress | 8.7 (16.1) | 10.7 (14.9) | 9 (14) |
| lz4js 0.2.0 compress | 17 (24.9) | 15.1 (24.6) | 13 (24) |
| **lz4-kit decompress** | 4.7 (7.1) | 5.0 (7.1) | 3.5 (6.5) |
| lz4-wasm 0.9.2 decompress | 4.3 (6.3) | 4.5 (5.8) | 5 (6) |
| lz4js 0.2.0 decompress | 13.8 (14.7) | 13.1 (12.3) | 11 (15) |
| output size, bytes | 955,395 | 955,395 | 955,395 |

  Output sizes for the other two: lz4-wasm 984,527 and lz4js 965,955 (the same in all three browsers). The kit took 3 to 13 ms to compile across runs.
  - **Against lz4js** (pure JavaScript, `.lz4` frames): lz4-kit compresses 1.2 to 1.7 times faster and decompresses 2.6 to 3.1 times faster, and adds levels 1 to 12.
  - **Against lz4-wasm** (Rust, the `lz4_flex` library; its own block format with the size in front, not the `.lz4` frame, and no high-compression levels): a tie within the noise. lz4-wasm compresses a little faster in Chromium and WebKitGTK (8.7 against 9.8 ms, 9 against 11), lz4-kit in Firefox; lz4-wasm decompresses a little faster in Chromium and Firefox, lz4-kit in WebKitGTK. The cloud noise is about 10%, so do not read a winner into these gaps. What lz4-kit adds is the standard frame and blocks, levels up to 12, and the official library at the fixed release.
- **Two more libraries** (same page, fresh page each, median of 3 pages in Chromium and Firefox, 4 pages in WebKitGTK for the last two rows; ms steady, first call in brackets). Compared against the kit's block calls where the rival is block-only, and against the kit's frame decompress for the frame-only rival. [gorhill/lz4-wasm](https://github.com/gorhill/lz4-wasm) is not on npm: its files were fetched from the master branch on 2026-11-19 (no commit hash could be read from here), wasm flavor and pure JavaScript flavor, block format. [wasm-lz4](https://github.com/cruise-automation/wasm-lz4) 2.0.0 is decompress-only (frames), so there is no compress number for it.

| 4 MB log data | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---|---|---|
| lz4-kit block compress | 8.1 (15.1) | 8.5 (16.1) | 8 (15) |
| gorhill wasm compress | 7.6 (18.1) | 9.3 (16.3) | 6 (16) |
| gorhill JS compress | 12.7 (20.1) | 11.5 (14.2) | 9 (16) |
| lz4-kit block decompress | 4.1 (7.8) | 4.9 (7.8) | 4 (6) |
| gorhill wasm decompress | 3.7 (5.1) | 4.3 (4.6) | 3 (5) |
| gorhill JS decompress | 8.5 (11.2) | 8.3 (9.6) | 6 (11.5) |
| lz4-kit frame decompress | 4.7 (see above) | 5.0 | 3.5 |
| wasm-lz4 2.0.0 frame decompress | 5.1 (11.8) | 4.8 (7.6) | 4.5 (10.5) |

  Output sizes: lz4-kit block 954,438; gorhill 960,429 (both flavors). The rival wasm libraries hand back a view into their own memory, while lz4-kit returns a copy (not timed separately here), except that the wasm-lz4 row copies its output as well.
  - **Against gorhill/lz4-wasm**: a tie to a small loss for lz4-kit on speed in the wasm flavor (gorhill compresses faster in Chromium and WebKitGTK, decompresses faster in all three, by 0.6 to 1 ms) (part of that gap is probably the copy, not measured). gorhill's output is 0.6% larger. The kit is 1.4 to 2 times faster than gorhill's JavaScript flavor. gorhill has no frame, no levels and no checksum.
  - **Against wasm-lz4**: a tie within noise on frame decompress, the kit slightly ahead in Chromium and WebKitGTK; the kit also compresses and has levels.
  - Not measured: the browser's other LZ4 options, phone, owner laptop.

## API

| Call | Gives |
|---|---|
| `init()` | a promise; call once, before anything else |
| `ready()` | `true` after `init()` finished |
| `compress(data, level = 0)` | `Uint8Array`, one `.lz4` frame with its content size and a content checksum |
| `decompress(frame, size?)` | `Uint8Array`; frames in a row are joined |
| `compressBlock(data, level = 0, acceleration = 1)` | `Uint8Array`, a raw block |
| `decompressBlock(block, size)` | `Uint8Array`; `size` is required |
| `release()` | frees the working memory |
| `version`, `lz4Version` | `'1.0.0'`; `'1.11.1'` |

Errors: a call before `init()` finishes throws. So do a damaged or truncated block or frame, a frame whose content checksum does not match, a wrong `size`, a level outside 0 to 12, an acceleration below 1, and an input that is not bytes or a string.

## Test it and rebuild it

`node modules/lz4-kit/test/run.js` runs 934 checks in about 4 s. They cover:
- Block and frame round trips at 9 sizes up to 2.1 MB, 3 kinds of data and levels 0 to 12.
- An independent decoder written from the LZ4 format description in the test file (block decoder, frame parser, XXH32 content checksum) reads everything the module writes.
- The 1.11.0 case: levels 9 to 12 on a stream state filled with different garbage must give the same bytes every time, and 200 repeated calls on dirty states.
- Frames written one after another, and every error path.

`sh modules/lz4-kit/wasm/build.sh` rebuilds the WebAssembly from the pinned LZ4 1.11.1 release, checked by SHA-256, with clang 18. Then run `python3 modules/lz4-kit/build.py`.

## For AI agents

Load `lz4-kit.js` (global `Lz4Kit`, or `require` it), `await Lz4Kit.init()`, then call `compress`/`decompress`/`compressBlock`/`decompressBlock` synchronously. Frames record their size; blocks do not. Level 0 is the fast mode; 12 is the best compression. Release 1.11.1 of LZ4 is inside; do not mix in 1.11.0.

## Prior art and credits

- **LZ4** by Yann Collet and contributors, https://lz4.org/ and https://github.com/lz4/lz4 (BSD 2-Clause for the library). The block and frame formats, and all the compression code in the WebAssembly, are theirs and are compiled unchanged. Release 1.11.1 contains the fix for the `LZ4_resetStreamHC` out-of-bounds write.
- The small C layer (`wasm/lz4-glue.c`), the stubs, the JavaScript wrapper and the tests are LFC Foundry's (MIT License). The layout follows [zstd-kit](../zstd-kit/README.md).
