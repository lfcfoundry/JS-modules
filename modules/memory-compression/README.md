# memory-compression

**Version 1.0.0 · API 1**

**Tested in:** Firefox 158.0, ungoogled Chromium 155.0.8059.39-1 and WebKitGTK 2.52.6, one at a time: the full benchmark page (79 of 79 self-checks pass in each, every result restored byte for byte), a comparison page against fflate, pako, lz4js, lz4-wasm, zstd-wasm and CompressionStream, and the demo page; the demo page also in GNOME Web (Epiphany) 46.5 (both rows restored byte for byte at 8 MB and 32 MB). Node 22.22.0: 23 checks, with and without WebAssembly. Not run: the benchmark page in GNOME Web 46.5, a phone, a real Net Flow Map scene.

Holds big data (floats, coordinates, records, text) packed in memory and brings it back fast and exactly. About 91 KB with comments (a 22 KB WebAssembly helper is part of that, and it is optional), no dependencies, works offline.

**Test it:** `node modules/memory-compression/test/run.js` (23 checks, about 2.5 s; `JS_ONLY=1` runs everything without WebAssembly; `FULL=1` runs 10 times more random cases). **Try it:** `demo.html`.

## Quick start
```js
var grid = new Float32Array(4000000);                     // any typed array, or bytes
var packed = MemoryCompression.pack(grid);                // a Uint8Array, about 55% of the size here (see Numbers)
grid = null;                                              // free the big one
var back = MemoryCompression.unpack(packed);              // a Float32Array again, every bit the same
```
Records (many rows of the same shape) shrink much more when you say how wide a row is, in bytes:
```js
var nodes = new Float32Array(100000 * 16);                // 16 floats per node = 64 bytes per record
var packed = MemoryCompression.pack(nodes, { width: 64 });
```
Keep it packed, and bring back only the piece you need (1 MiB by default):
```js
var held = MemoryCompression.pack(nodes, { width: 64, chunk: 262144 });   // pieces of 256 KiB
var v = MemoryCompression.view(held);                     // reads the table of pieces once
var piece = v.read(3);                                    // Uint8Array holding only piece 3, restored in about 1 ms
var buf = new Uint8Array(v.chunkBytes); v.read(5, buf);   // or into a buffer you reuse, so nothing new is allocated
```
`MemoryCompression.ready()` is a promise that resolves when the fast WebAssembly path has been chosen (a moment after page load in Chrome); calls made earlier still work, in plain JavaScript.

## Two modes
| | `mode: 'fast'` (default) | `mode: 'small'` |
|---|---|---|
| Use it for | live memory: pack and restore often, inside a game | save files, undo history, scenes you will not touch for a while |
| Coder | LZ4-class | deflate (the same kind of bits as zip and gzip) |
| Floats and records, size | 39% to 92% of the original | 29% to 82% |
| Speed here (Node, 16 MB) | pack 350 to 870 MB/s, restore 700 to 1150 MB/s | pack 30 to 110 MB/s, restore 270 to 640 MB/s |
| Text | about LZ4 size (40% to 56%) | about the same size as fflate and pako (25% to 38%) |

## Numbers
Measured on this machine (4 cores), best of several runs, MB/s counted on the original size; every result was unpacked and compared byte for byte. Cell = size as a share of the original, pack speed, restore speed. Full tables for Node and for each browser are in the review (`REVIEW.md`). Floats here are the hard kind: noisy coordinates, decimals and random walks.

| 16 MB of... | memory-compression fast | memory-compression small | lz4js | fflate level 6 | pako level 6 |
|---|---|---|---|---|---|
| walking float32 values | 56.7% · 666 · 988 | 48.8% · 70 · 486 | 99.8% · 126 · 384 | 74.2% · 17 · 72 | 77.2% · 14 · 80 |
| 28-byte records (positions, colors, ids) | 38.5% · 555 · 835 | 28.9% · 39 · 488 | 72.0% · 79 · 299 | 46.2% · 10 · 111 | 48.6% · 9 · 123 |
| noisy float32 coordinates | 91.5% · 603 · 1099 | 82.0% · 41 · 411 | 100.0% · 237 · 456 | 90.7% · 19 · 75 | 90.1% · 14 · 81 |
| JSON text with coordinates (4 MB) | 40.5% · 309 · 1075 | 25.0% · 33 · 499 | 41.1% · 156 · 265 | 25.9% · 22 · 136 | 24.1% · 16 · 160 |

A 120 MB scene (records, coordinates and text) in Node: kept packed it is 52% of its size in fast mode and 41% in small mode; restoring it takes about 175 ms (fast; 136 ms into a buffer you already have), 340 ms (small), against 525 ms for lz4js, 1.2 s for fflate and 1.6 s for pako. Holding six such scenes took 720 MB raw, 375 MB packed fast and 297 MB packed small (measured in Node, `arrayBuffers`). Without WebAssembly the same fast restore takes about 630 ms.

## What it is not
- **Not a magic fix for noisy floats.** Coordinates with random low digits give up only 10 to 20% (small mode) or about 8% (fast mode). Colors, ids, flags, repeated values and smooth sequences give up 50 to 70%.
- **Not a way to compress what is being drawn this frame.** Restoring a 120 MB scene takes 140 to 250 ms. Use it for data that sits still (other scenes, undo steps, saves, big tables), then restore it when you need it.

## Compared with the alternatives
I measured it against fflate 0.8.3, pako 3.0.2, lz4js 0.2.0, **lz4-wasm 0.9.2** (a WebAssembly LZ4), **@bokuweb/zstd-wasm 0.0.27** (a WebAssembly zstd), fzstd 0.1.1 (a plain-JavaScript zstd reader) and the browser's own **CompressionStream**. Same data for every one, every result restored and compared byte for byte. The full tables for each browser are in `REVIEW.md`.

### Speed and size (Node 22.22.0, 16 MB sets; cell = size · pack MB/s · restore MB/s)
| data | mc-fast | mc-small | lz4js | lz4-wasm | zstd-wasm 1 | zstd-wasm 3 | zstd-wasm 3 + shuffle | fflate 6 | pako 6 | CompressionStream (deflate-raw) |
|---|---|---|---|---|---|---|---|---|---|---|
| walk32 | 56.7% · 772 · 783 | 48.8% · 69 · 479 | 99.8% · 115 · 346 | 100.4% · 828 · 1204 | 79.3% · 283 · 197 | 76.6% · 109 · 169 | 54.6% · 133 · 272 | 74.2% · 14 · 75 | 77.2% · 13 · 83 | 77.2% · 26 · 116 |
| xy32 | 91.5% · 561 · 1066 | 82.0% · 40 · 402 | 100.0% · 258 · 422 | 100.4% · 1126 · 1204 | 90.0% · 194 · 165 | 90.1% · 173 · 153 | 82.0% · 153 · 371 | 90.7% · 16 · 75 | 90.1% · 13 · 78 | 90.1% · 26 · 121 |
| walk64 | 64.9% · 670 · 957 | 57.2% · 68 · 428 | 89.2% · 53 · 318 | 92.4% · 239 · 634 | 86.0% · 310 · 185 | 84.7% · 117 · 160 | 63.7% · 276 · 443 | 77.1% · 14 · 86 | 78.2% · 14 · 86 | 78.2% · 26 · 104 |
| scene28 | 38.5% · 513 · 772 | 28.9% · 39 · 472 | 72.0% · 74 · 219 | 72.2% · 241 · 654 | 49.6% · 134 · 242 | 49.4% · 81 · 262 | 29.4% · 108 · 188 | 46.2% · 10 · 124 | 48.6% · 9 · 116 | 48.6% · 16 · 124 |
| prose-md | 56.2% · 196 · 873 | 38.2% · 25 · 338 | 57.3% · 92 · 158 | 59.7% · 214 · 1112 | 42.1% · 134 · 396 | 35.8% · 83 · 411 | - | 38.6% · 17 · 106 | 37.4% · 13 · 114 | 37.4% · 27 · 118 |
| json-coords | 40.5% · 303 · 999 | 25.0% · 32 · 481 | 41.1% · 150 · 254 | 42.0% · 241 · 1010 | 24.2% · 148 · 387 | 25.9% · 82 · 394 | - | 25.9% · 21 · 143 | 24.1% · 16 · 160 | 24.1% · 36 · 139 |
| mixed-scene | 58.5% · 417 · 799 | 48.0% · 32 · 385 | 75.7% · 103 · 327 | 76.0% · 364 · 1067 | 57.6% · 169 · 235 | 57.7% · 100 · 231 | 47.1% · 78 · 158 | 56.1% · 12 · 93 | 57.0% · 10 · 105 | 57.0% · 19 · 132 |

`zstd-wasm 3 + shuffle` is zstd with this module's byte shuffle put in front, to show how much of the gain is the float pre-step: it closes most of the size gap on floats, but restores 2 to 3 times slower than `mc-small` and 3 to 5 times slower than `mc-fast`. fzstd (zstd decode in plain JavaScript) restored the zstd data at 55 to 127 MB/s. The same comparison measured inside Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6 shows the same order (tables in `REVIEW.md`).

### A 120 MB scene, in each browser (pack time · restore time · extra memory)
Extra memory = the most the whole browser grew while packing and restoring, beyond the scene itself (120 MB, already held). It includes the packed copy and the restored copy, so about 180 MB is the least any method can show; one run per cell, memory read from the operating system every 30 ms, so differences under about 100 MB are noise.

| method | size | Firefox 158: pack · restore · extra memory | Chromium 155: pack · restore · extra memory | WebKitGTK 2.52.6: pack · restore · extra memory |
|---|---|---|---|---|
| memory-compression fast | 52.1% | 375 ms · 239 ms · 131 MB | 351 ms · 195 ms · 251 MB | 410 ms · 221 ms · 159 MB |
| memory-compression small | 41.3% | 3731 ms · 434 ms · 127 MB | 3407 ms · 351 ms · 149 MB | 3089 ms · 363 ms · 160 MB |
| lz4js | 73.3% | 1534 ms · 537 ms · 284 MB | 1552 ms · 496 ms · 298 MB | 1091 ms · 406 ms · 400 MB |
| lz4-wasm (WebAssembly LZ4) | 73.6% | 849 ms · 312 ms · 281 MB | 679 ms · 226 ms · 298 MB | 505 ms · 123 ms · 297 MB |
| zstd-wasm level 3 (WebAssembly zstd) | 54.0% | 1563 ms · 626 ms · 292 MB | 1519 ms · 627 ms · 305 MB | 1551 ms · 530 ms · 447 MB |
| fflate level 6 | 51.8% | 12979 ms · 1549 ms · 251 MB | 11146 ms · 1415 ms · 166 MB | 8467 ms · 3637 ms · 482 MB |
| pako level 6 | 53.1% | 17084 ms · 1310 ms · 158 MB | 10718 ms · 1356 ms · 142 MB | 8843 ms · 758 ms · 222 MB |
| CompressionStream (deflate-raw) | 52.6% | 3682 ms · 439 ms · 238 MB | 4752 ms · 463 ms · 242 MB | 4468 ms · 985 ms · 457 MB |

### What each one is good at, in plain words
- **lz4-wasm** is the fastest plain LZ4 here, and it restores faster than this module on data it cannot shrink or hardly shrinks (noisy floats, prose): up to 1.5 times faster in Node (1.2 GB/s against 0.8 to 1.07). On records and 64-bit floats, where there is something to remove, memory-compression restores as fast or faster (28-byte records 772 against 654 MB/s, float64 957 against 634) and packs faster (513 against 241 MB/s on the records), and it leaves records at 39% instead of 72% and walking floats at 57% instead of 100%. On the 120 MB scene lz4-wasm restored faster only in WebKitGTK (123 ms against 221 ms); in Firefox (312 against 239 ms) and Chromium (226 against 195 ms) memory-compression was faster, and it held the scene in 52% of the space instead of 74%.
- **zstd-wasm** gives the best text size at level 3 (prose 35.8% against 38.2% for small mode, JSON 25.9% against 25.0%), but it is a 270 KB download, restores at 150 to 410 MB/s, and does nothing for floats unless you shuffle first.
- **fflate and pako** are the safe standards: good on text, 12 to 14 KB gzipped, streaming. Level 6 packs at 9 to 16 MB/s and restores at 70 to 160 MB/s here, the slowest of the group; fflate also has a multi-thread mode that this module does not have (not measured).
- **CompressionStream** costs nothing to ship and restores 100 to 335 MB/s in these browsers, packing at 16 to 52 MB/s (faster than fflate and pako at level 6, far slower than the LZ4 class). It is asynchronous only, so it cannot be used in the middle of a frame, and it knows nothing about floats.

### Features
| | memory-compression 1.0.0 | fflate 0.8.3 | pako 3.0.2 | lz4js 0.2.0 | lz4-wasm 0.9.2 | zstd-wasm 0.0.27 | fzstd 0.1.1 | CompressionStream |
|---|---|---|---|---|---|---|---|---|
| License | MIT | MIT | MIT and Zlib | ISC | MIT (Apache text also shipped) | MIT | MIT | built into the browser |
| Size to ship (gzipped) | 91 KB (31 KB); not minified, WebAssembly text is 29 KB of it | 33 KB (12.6 KB) | 45 KB (14.0 KB) | 16 KB (4.6 KB), not minified | 29 KB (11.6 KB) | 270 KB (84.5 KB) | 8.4 KB (3.9 KB) | 0 |
| Compress and decompress | both | both | both | both | both | both | decompress only | both |
| Synchronous | yes | yes (and async with worker threads) | yes | yes | yes, after an asynchronous start | yes, after an asynchronous start | yes | no, streams only |
| Streaming | no | yes | yes | no | no | no (simple API only) | yes | yes |
| Understands floats and records | **yes** (byte shuffle, column difference) | no | no | no | no | no | no | no |
| Keep packed and read pieces | **yes** (`view()`) | no | no | no | no | no | no | no |
| Formats | its own container, LZ4 block, deflate, zlib, gzip | deflate, zlib, gzip, zip | deflate, zlib, gzip | LZ4 frame and block | LZ4 block with a 4-byte length in front | zstd | zstd | gzip, deflate, deflate-raw |
| Levels | fast or small; deflate 0 to 9 | 0 to 9 | 0 to 9 | none | none | 1 to 22 | n/a | none |
| Preset dictionary | no | yes | yes | no | no | yes | no | no |
| Works without WebAssembly | **yes** (about 1.5 to 4 times slower) | n/a (no WebAssembly) | n/a | n/a | no | no | n/a | n/a |
| Works offline, one file | yes (WebAssembly is inside the file) | yes | yes | yes | needs its glue and a wasm file (I inlined both for the test) | needs its glue and a 252 KB wasm file (inlined for the test) | yes | yes |
| Plain-JavaScript source you can read | yes | yes | yes | yes | no (Rust) | no (C) | yes | no |

The byte-shuffle idea is not new: Blosc (a C library) has long shuffled bytes and then compressed them with LZ4 or zstd. This module puts that idea, with a deflate option and chunked reading, into one JavaScript file for the browser. I did not measure Blosc or the float-specific coders (fpzip, ZFP), which have no browser build I could run here.

**Inside JS-modules:** `save-kit` and `zip-open` use the browser's own `CompressionStream` and `DecompressionStream` (asynchronous, no float handling); `lzma-decode` and `ppmd-decode` only unpack and are for download packages. This module is the synchronous one for live memory. `zip-open` could use its `inflate()` later.

## API
`pack(data, opts)` returns a `Uint8Array`. `data` is any typed array, `ArrayBuffer`, `DataView` or `Uint8Array`.
| Option | Meaning | Default |
|---|---|---|
| `mode` | `'fast'` or `'small'` | `'fast'` |
| `level` | deflate effort 0 to 9 (small mode); fast mode accepts but ignores it | 4 (small) |
| `width` | bytes per record: a whole number 1 to 255, or `'auto'` (tries 2 to 64 and keeps one only if it wins by 3%) | the element size of the array (4 for `Float32Array`) |
| `shuffle` | `false` turns the pre-step off, `true` skips the "is it worth it" test | test it |
| `delta` | `false` turns off the per-column difference step | on, if it helps |
| `chunk` | bytes per piece (rounded to a whole number of records, at least 4096) | 1048576 |
| `check` | `true` adds a checksum that `unpack()` verifies | off |
| `wasm` | `false` forces plain JavaScript | use WebAssembly if available |

`unpack(bytes, opts)` returns the same kind of typed array that went in (`as: 'bytes'` for a `Uint8Array`). `opts.into` is a typed array of exactly the right size to fill instead of allocating (no new memory). `opts.maxSize` (default 1 GiB) refuses bigger results.

`view(bytes, opts)` returns `{ size, chunkBytes, chunks, width, packedBytes, chunkLength(i), chunkOf(byteOffset), read(i, into) }`. `read(i)` restores chunk `i` as a `Uint8Array`; with `into` (at least `chunkLength(i)` bytes) it fills that and returns the part it wrote. It does not check the optional checksum (`unpack` does).

Standard formats: `lz4Compress(data)` and `lz4Decompress(data, exactSize)` (LZ4 block format), `deflate`, `inflate`, `zlib`, `unzlib`, `gzip`, `gunzip` (`inflate*` accept `size` and `maxSize`). `shuffle(data, width)` and `unshuffle(bytes, width)`, `crc32`, `adler32`, `checksum`. `ready()`, `accelerated()`.

Errors are `Error` objects whose message starts with `MemoryCompression:` and say what is wrong in plain words.

## Good to know
- **Exact, always.** Floats are handled as bytes: NaN payloads, -0 and denormals come back bit for bit.
- **Hostile input is safe to read.** Every read and write is bounds-checked, declared sizes are checked against what is possible (no coder here squeezes more than 1032 to 1), and results above `maxSize` are refused. Damaged or cut-off data throws; flipped bytes either throw or give back wrong bytes of the right length unless you used `check: true` (the format has no per-chunk checksum).
- **The WebAssembly helper is optional.** A page policy without `'wasm-unsafe-eval'` (or an old browser) makes `accelerated()` return `false`; everything still works and gives the same bytes, about 1.5 to 4 times slower. Tested in Firefox 158 and ungoogled Chromium 155 with such a policy. In Chrome the helper is compiled asynchronously, so await `ready()` once at start-up for the fast path from the first call.
- **Memory while packing** is the input, the finished pieces (about the size of the final result) plus the joined result, and about 1 MiB of working space; `unpack` needs the result plus about 1 MiB (nothing extra with `into`). Packing 120 MB peaked about 59 MB lower after the pieces were joined once at the end instead of written into a buffer as big as the input.
- **No streaming, no LZ4 frame format, no preset dictionary** for the standard formats. `gzip` output has no file name and no timestamp.
- The format is this module's own (the first two bytes are `MC`, then a version); a container written by 1.x is read by every later 1.x.

## For AI agents
- Use `pack`/`unpack` for typed arrays you want to keep in memory compactly or save; pass `width` equal to the record size in bytes whenever the array is rows of the same shape; use `mode: 'small'` for anything restored rarely, `'fast'` for anything restored often.
- Keep many packed things and restore one at a time with `unpack(packed, { into: reusableBuffer })`. For one huge array, `pack` with a `chunk` of 256 KiB to 1 MiB and read pieces with `view()`.
- Await `MemoryCompression.ready()` once at start-up. Never assume the data is smaller: random-looking floats give up only 10 to 20%; check `packed.length`.
- Do not use it for what is drawn every frame. Do not add a second compression library next to it; its `deflate`/`inflate`/`gzip`/`lz4Compress` replace fflate, pako and lz4js for what they do here.
- To rebuild the WebAssembly helper: `sh wasm/build.sh && python3 wasm/embed.py` (needs clang with the wasm32 target). The JavaScript and WebAssembly paths must stay byte-identical; the tests check that.
