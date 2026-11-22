# zstd-kit

**Version 1.0.1 · API 1**

**Tested in:** Chromium 156, Firefox 158, WebKitGTK 2.52.6

Part of [JS-modules](../../README.md). MIT License, Copyright (c) 2026 LFC Foundry. The WebAssembly inside is Zstandard 1.5.7 (BSD-3-Clause, see [NOTICE-zstd.txt](NOTICE-zstd.txt)).

## What it is and how it works

Zstandard compression in the browser and in Node, plus the XXH64 and CRC-32 checksums, from one WebAssembly build of the official Zstandard library. `zstd-kit.js` compresses and decompresses (154.3 KB gzipped); `zstd-kit-dec.js` only decompresses (34.0 KB gzipped). No dependencies.

- `await ZstdKit.init()` once. It compiles the WebAssembly, which takes 7 to 12 ms in the test browsers.
- `ZstdKit.compress(bytes, level)` gives one standard Zstandard frame that records its size. `level` runs from -7 to 22 and defaults to 3. At level 3, text of 256 KB or more is tried on a sample with two finer match settings, and the smallest result is kept. The format is unchanged, so any zstd reader opens it.
- `ZstdKit.decompress(frame, size)` returns the original bytes. `size` is needed only for a frame that does not record its size.
- `ZstdKit.xxh64(bytes)` returns 16 hex digits (seed 0). `ZstdKit.crc32(bytes)` returns the zip, gzip and PNG CRC-32 as a number.
- Every call takes a Uint8Array, another typed array, an ArrayBuffer or a string (encoded as UTF-8).

It is the same WebAssembly and wrapper that [lfc-pack](../lfc-pack/README.md) has always used inside. It was split out on 2026-11-14 (after lfc-pack 0.10.25) so it has its own page, tests and credits; lfc-pack's build now takes it from here, and lfc-pack's code is unchanged.

## Why it exists

Browsers have gzip and deflate built in (`CompressionStream`), but not Zstandard. Zstandard decompresses about 2 to 3 times faster than the browser's own gzip. Files from servers, data lakes and tools that use zstd need a reader in the page.

**Where it helps**

- Reading `.zst` files or zstd-compressed responses in a page or worker.
- Fast checksums of big byte arrays: XXH64 of 4 MB takes about 2 ms.
- A page that already loads lfc-pack has all of this inside it.

**Not for:** small pages that only need gzip; use `CompressionStream`, which costs no download. Streams larger than memory are not supported either: a whole frame goes in and comes out at once.

## Use

```js
await ZstdKit.init();
const frame = ZstdKit.compress(new TextEncoder().encode(text));       // Uint8Array, a standard .zst frame
const back = new TextDecoder().decode(ZstdKit.decompress(frame));
const check = ZstdKit.xxh64(frame);                                     // 'ef46db3751d8e999' for empty input
```

`decodeOnly` is `true` in `zstd-kit-dec.js`, where `compress` throws. Call `release()` after a big job to free the compressor's working memory. WebAssembly memory itself never shrinks.

## Numbers and how it compares

These numbers come from 4 MB of web-server log lines (JSON), on a fresh page each time, as the median of 3 pages. Each call ran 5 times on the page; warm is the middle of the last 4. Times are in ms; lower is better.

| | ungoogled Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---|---|---|
| fzstd 0.1.1, decompress warm | 24.5 | 24 | 26 |
| browser gzip (`DecompressionStream`), warm | 18.2 | 22 | 20 |
| **zstd-kit decompress, warm** | **7** | **9** | **8** |
| fzstd 0.1.1, decompress first call | 57.4 | 34 | 60 |
| browser gzip, first call | 19.8 | 25 | 22 |
| **zstd-kit decompress, first call** | **18.4** | **14** | **21** |
| browser gzip (`CompressionStream`), compress | 100.3 | 91 | 94 |
| **zstd-kit compress, level 3** | **33.4** | **31** | **52** |
| Size: browser gzip / zstd-kit level 3 | 726,865 / 804,889 | 750,097 / 804,889 | 768,375 / 804,889 |

- **Where it wins:**
  - On real files (retail, SEC and SBA tables, 4 MiB each, three test browsers, 2026.11.22): decompression is 1.9 to 6.4 times faster than fzstd and 1.9 to 4 times faster than the browser's own gzip; compression is 2.8 to 8 times faster than the browser's gzip.
  - It is the only one of these that does both Zstandard directions.
- **Where it loses:**
  - Download size: fzstd is 3.8 KB gzipped against 34.0 KB for the decoder build. The browser's gzip is free.
  - On the generated logs measured earlier, level 3 frames were 5 to 10% bigger than the browser's gzip; on the three real files they are smaller (0.60 to 0.94 of gzip's size).
  - @bokuweb/zstd-wasm was not measured yet.

## API

| Call | Gives |
|---|---|
| `init()` | a promise; call once, before anything else |
| `ready()` | `true` after `init()` finished |
| `compress(data, level = 3)` | `Uint8Array`, one frame with its content size |
| `decompress(frame, size?)` | `Uint8Array` |
| `contentSize(frame)` | the recorded size, or -1 |
| `xxh64(data)` | 16 lowercase hex digits, seed 0 |
| `crc32(data)` | unsigned 32-bit number |
| `release()` | frees the compressor's working memory |
| `version`, `decodeOnly` | `'1.0.0'`; `true` in zstd-kit-dec.js |

Errors: a call before `init()` finishes throws. So do a damaged frame, a frame with no recorded size and no `size` argument, a level outside -7 to 22, and an input that is not bytes or a string.

## Test it and rebuild it

`node modules/zstd-kit/test/run.js` runs 156 checks in about 1 s. They cover:
- Round trips at 8 sizes up to 2.1 MB and at 7 levels.
- Both directions against Node's own zstd (libzstd).
- The decode-only build.
- XXH64 test vectors, and CRC-32 against `zlib.crc32`.
- Every error path.

`sh modules/zstd-kit/wasm/build.sh` rebuilds both WebAssembly files from the pinned Zstandard 1.5.7 release, checked by SHA-256, with clang 18. Then run `python3 modules/zstd-kit/build.py` and `python3 modules/lfc-pack/build.py`. `src/zstd-core.js` is shared with lfc-pack.

## For AI agents

Load `zstd-kit.js` (global `ZstdKit`, or `require` it), `await ZstdKit.init()`, then call `compress`/`decompress`/`xxh64`/`crc32` synchronously. Use `zstd-kit-dec.js` when the page only reads. One frame in, one frame out; frames without a recorded size need the size as the second argument. Do not edit `zstd-kit.js` by hand: edit `src/` and run `build.py`.

## Prior art and credits

The WebAssembly is the official Zstandard library, compiled unchanged; only the small C layer (`wasm/zstd-glue.c`, an allocator and the exported calls) and the JavaScript are this repository's (LFC Foundry, MIT).

**Original sources** (links checked 2026-11-14):

- [Zstandard](https://facebook.github.io/zstd/) 1.5.7 by Yann Collet and Meta Platforms, BSD-3-Clause, code included ([NOTICE-zstd.txt](NOTICE-zstd.txt)); the format is [RFC 8878](https://www.rfc-editor.org/rfc/rfc8878)
- [XXH64](https://xxhash.com/) by Yann Collet, the copy inside Zstandard, code included
- CRC-32: Peterson and Brown, ["Cyclic Codes for Error Detection"](https://doi.org/10.1109/JRPROC.1961.287814), 1961, with the table-per-byte "slicing" speedup of Kounavis and Berry (Intel), ["A Systematic Approach to Building High Performance Software-Based CRC Generators"](https://doi.org/10.1109/ISCC.2005.18), 2005; written here, no code taken
- [fzstd](https://github.com/101arrowz/fzstd) (MIT, by 101arrowz) and the browser's `CompressionStream` were run as comparisons only

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
