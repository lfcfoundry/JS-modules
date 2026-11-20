# lz4-kit

**Version 1.1.0 · API 1**

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
  - Against the other LZ4 libraries (table below) it is level with or ahead of the fastest on compress and, with the view option, 2.0 to 2.5 times faster on decompress.
  - It reads and writes the standard `.lz4` frame and raw blocks, with high-compression levels up to 12, from the fixed release.
- **Where it loses:**
  - Size: on these logs the fast frame is 1.7 to 1.9 times the size of gzip, and level 12 is still 18 to 26% bigger than gzip. LZ4 trades size for speed.
  - Download size: the file is 48.2 KB gzipped; the browser's gzip is free.
  - Compression at levels 9 to 12 takes 110 to 290 ms for 4 MB, slower than gzip here.
- **Against other LZ4 libraries and gzip** (page `bench/laptop-tester.html`, which anyone can open from the web and run; 4 MiB of the same generated logs, raw blocks for lz4-kit, gorhill and lz4-wasm, frames for lz4js, wasm-lz4 reading lz4-kit frames; median of 3 pages per browser, each timed over a batch of at least 60 ms so a 1 to 2 ms clock cannot blur it; ms for the whole 4 MiB, lower is faster). Versions: lz4-kit 1.1.0, lz4js 0.2.0, lz4-wasm 0.9.2, wasm-lz4 2.0.0, gorhill/lz4-wasm master (no release exists and no commit hash could be read from here; the page prints a SHA-256 of each file it loads). "view" rows return a window into the library's memory without a copy (valid until the next call), the way gorhill/lz4-wasm does; "copy" rows return a private copy, the way lz4-kit does by default.

| Compress, 4 MiB | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---|---|---|
| browser gzip | 33.7 | 38.0 | 43.0 |
| lz4js 0.2.0 | 15.2 | 14.1 | 11.8 |
| lz4-wasm 0.9.2 | 8.9 | 9.9 | 8.6 |
| gorhill/lz4-wasm (view) | 6.7 | 8.9 | 7.4 |
| **lz4-kit (copy)** | 7.2 | 7.3 | 7.3 |
| **lz4-kit (view)** | 6.8 | 5.8 | 6.9 |

| Decompress, 4 MiB | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---|---|---|
| browser gzip | 6.7 | 8.8 | 13.0 |
| lz4js 0.2.0 | 12.7 | 13.1 | 7.9 |
| lz4-wasm 0.9.2 | 4.8 | 4.7 | 3.6 |
| gorhill/lz4-wasm (view) | 3.4 | 4.2 | 3.7 |
| wasm-lz4 2.0.0 (decompress only) | 4.4 | 4.3 | 3.0 |
| **lz4-kit (copy)** | 3.8 | 3.8 | 2.1 |
| **lz4-kit (view)** | 1.6 | 1.7 | 1.5 |

  Output sizes in bytes: lz4-kit block 954,438; gorhill 960,429; lz4js 965,955; lz4-wasm 984,527; lz4-kit frame 955,395; browser gzip 511,510 (Chromium), 549,465 (Firefox), 542,370 (WebKitGTK).
  - **Compress:** with the view option lz4-kit is level with gorhill/lz4-wasm in Chromium (6.8 against 6.7 ms) and ahead of it in Firefox (5.8 against 8.9) and WebKitGTK (6.9 against 7.4); it is 1.2 to 1.7 times faster than lz4-wasm and 5.0 to 6.6 times faster than gzip. With the default private copy it is 7.2 to 7.3 ms, a tie with gorhill in Chromium and WebKitGTK and ahead in Firefox. On small calls the gap grows: 1024 calls of 4 KiB take 5.4 to 5.9 ms with the view option and 6.8 to 7.0 with the copy, against 11.8 to 21.7 for gorhill and 8.7 to 9.8 for lz4-wasm.
  - **Decompress:** with the view option lz4-kit takes 1.5 to 1.7 ms, 2.0 to 2.5 times faster than every other LZ4 library here and 4 to 9 times faster than gzip. With the private copy it takes 2.1 to 3.8 ms: level with gorhill and wasm-lz4 in Chromium and Firefox and ahead of them in WebKitGTK. Most of the view option's gain is the 4 MiB copy the other libraries skip.
  - **Against lz4js** (pure JavaScript): 1.6 to 2.4 times faster to compress, and 3.3 to 7.9 times faster to decompress, with levels 1 to 12 added.
  - **What the speed rows do not say:** gzip makes smaller files (1.7 to 1.9 times smaller on these logs); lz4-kit is the speed pick. gorhill/lz4-wasm has no frame, no levels and no checksum; wasm-lz4 only decompresses.

## API

| Call | Gives |
|---|---|
| `init()` | a promise; call once, before anything else |
| `ready()` | `true` after `init()` finished |
| `compress(data, level = 0, options?)` | `Uint8Array`, one `.lz4` frame with its content size and a content checksum |
| `decompress(frame, size?, options?)` | `Uint8Array`; frames in a row are joined |
| `compressBlock(data, level = 0, acceleration = 1, options?)` | `Uint8Array`, a raw block |
| `decompressBlock(block, size, options?)` | `Uint8Array`; `size` is required |
| `release()` | frees the working memory |
| `version`, `lz4Version` | `'1.1.0'`; `'1.11.1'` |

`options` is `{ view: true }` or left out. By default every call returns a private copy. With `view: true` it returns a `Uint8Array` that looks straight into the module's own memory: no copy, 0.4 to 2.2 ms faster per 4 MB call, but it is valid only until the next lz4-kit call (the next call overwrites it, and a call that has to grow the memory detaches it). Copy it with `.slice()` if you need to keep it. The bytes are the same either way.

Errors: a call before `init()` finishes throws. So do a damaged or truncated block or frame, a frame whose content checksum does not match, a wrong `size`, a level outside 0 to 12, an acceleration below 1, and an input that is not bytes or a string.

## Test it and rebuild it

`node modules/lz4-kit/test/run.js` runs 942 checks in about 4 s. They cover:
- Block and frame round trips at 9 sizes up to 2.1 MB, 3 kinds of data and levels 0 to 12.
- An independent decoder written from the LZ4 format description in the test file (block decoder, frame parser, XXH32 content checksum) reads everything the module writes.
- The 1.11.0 case: levels 9 to 12 on a stream state filled with different garbage must give the same bytes every time, and 200 repeated calls on dirty states.
- Frames written one after another, and every error path.

`sh modules/lz4-kit/wasm/build.sh` rebuilds the WebAssembly from the pinned LZ4 1.11.1 release, checked by SHA-256, with clang 18. Then run `python3 modules/lz4-kit/build.py`.

## For AI agents

Load `lz4-kit.js` (global `Lz4Kit`, or `require` it), `await Lz4Kit.init()`, then call `compress`/`decompress`/`compressBlock`/`decompressBlock` synchronously. Frames record their size; blocks do not. Level 0 is the fast mode; 12 is the best compression. Release 1.11.1 of LZ4 is inside; do not mix in 1.11.0.

## Prior art and credits

- **LZ4** by Yann Collet and contributors, https://lz4.org/ and https://github.com/lz4/lz4 (BSD 2-Clause for the library). The block and frame formats, and all the compression code in the WebAssembly, are theirs and are compiled unchanged. Release 1.11.1 contains the fix for the `LZ4_resetStreamHC` out-of-bounds write.
- **Compiled together with LZ4 (same release, same license):** `lib/xxhash.c` (XXH32, used for the frame checksum), Copyright Yann Collet, BSD 2-Clause. `NOTICE-lz4.txt` is the library's own `lib/LICENSE`, copied word for word from the 1.11.1 tarball (checked 2026-11-20).
- **Measured against, not shipped, not copied:** [lz4js](https://github.com/Benzinga/lz4js) 0.2.0 (John Chadwick and contributors, ISC), [lz4-wasm](https://github.com/PSeitz/lz4-wasm) 0.9.2 (Pascal Seitz, MIT per npm; Rust `lz4_flex`), [gorhill/lz4-wasm](https://github.com/gorhill/lz4-wasm) (Raymond Hill, BSD 2-Clause) and [wasm-lz4](https://github.com/cruise-automation/wasm-lz4) 2.0.0 (Cruise, Apache-2.0). Their files were installed or fetched into a scratch folder to run `bench/rivals.html`; none of their code or any test data from them is in this repository. The benchmark data is generated by the page itself.
- The small C layer (`wasm/lz4-glue.c`), the stubs, the JavaScript wrapper and the tests are LFC Foundry's (MIT License). The layout follows [zstd-kit](../zstd-kit/README.md).
