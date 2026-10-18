# memory-compression

**Version 2.0.2 · API 2**

**Tested in:** not recorded.

Keeps big data packed in memory and brings it back exactly: bytes, typed arrays (floats, coordinates) and big lists of plain JavaScript objects. **One file, no dependencies, works offline: `memory-compression.js`** (270.0 KB readable, 83.5 KB gzipped). Two small WebAssembly helpers are inside the file and optional: the plain JavaScript does the same work and writes the same bytes, only slower. Until 2.0.0 this was two modules, `memory-compression` (bytes and typed arrays) and `memory-compression-jso` (objects). They are now this one file, and the separate `-jso` module is retired.

**Test it:** `node modules/memory-compression/test/core.js` (packing core, 24 checks), `test/run.js` (object layer, 38 checks) and `test/router.js` (the one entry point, 13 checks); each takes a few seconds. Add `--js-only` to run without WebAssembly and `FULL=1` for 10 times more random cases (`core.js` and `run.js`). **Try it:** `demo.html` (objects) and `demo-arrays.html` (arrays and bytes). **Rebuild the file:** `python3 modules/memory-compression/build.py`.

## One file, one entry point

```js
var packed = MemoryCompression.pack(anything);   // picks the layer for you
var back   = MemoryCompression.unpack(packed);   // reads the first two bytes to see which layer wrote it
var part   = MemoryCompression.view(packed);     // the same, for data that stays packed and is read a piece at a time
```

| You pass | Packed by | Why |
|---|---|---|
| A typed array or bytes (`Float32Array`, `Uint8Array`, `ArrayBuffer`, `DataView`) | The packing core ([part 1](#part-1-bytes-and-typed-arrays)) | Byte shuffle, per-column difference and an LZ4-class or deflate coder; the same bytes memory-compression 1.x wrote |
| A number typed array with `mode: 'balanced'` (or `picker: true`) | The number picker inside the object layer ([part 2](#part-2-plain-javascript-objects)) | Each block of numbers is tried several ways on a sample and the smallest way is kept |
| A number typed array with `mode: 'small'` | Whichever of three results is smallest: the core's deflate path, the picker with deflate, the picker alone | Slowest and smallest; all three are made and compared |
| Objects, lists of records, text, plain arrays, dates, maps, anything else | The object layer ([part 2](#part-2-plain-javascript-objects)) | Records become columns; patterns, dates, dictionaries, FSST and front coding are chosen per column |

`opts.layer` overrides the choice: `'core'` (bytes and typed arrays only) or `'objects'` (everything, typed arrays included). The parts are also on the object: `MemoryCompression.core` (the packing core alone), `.objects` or `.jso` (the object layer alone, which is what `MemoryCompressionJSO` is) and `.picker`. Every standard-format helper of the old module (`lz4Compress`, `deflate`, `inflate`, `zlib`, `gzip`, `crc32`, `shuffle` ...) is on `MemoryCompression` too, and so are `keeper()`, `estimateBytes()` and `profile()`.

**What the automatic choice does not do yet.** The layer is chosen from the kind of thing you pass and from `mode`. The module does not yet look inside a typed array to guess whether the number picker would win (you ask with `mode`, or `small` tries all three), does not choose `fast`, `balanced` or `small` for you from the size or a time budget, and does not treat a plain JavaScript array of numbers as a number column unless you pack it with `layer: 'objects'`. Inside the object layer the per-column choice (patterns, dates, dictionary, FSST, front coding, number picker) was already automatic.

## Moving from the two old modules

| If your code used | Now |
|---|---|
| `memory-compression.js` (global `MemoryCompression`, bytes and typed arrays) | Load the new `memory-compression.js`. Same calls and same bytes for typed arrays and bytes. Files packed by 1.x open. |
| `memory-compression-jso.js` (global `MemoryCompressionJSO`) | Load `memory-compression.js` instead. `MemoryCompressionJSO` is kept as an alias and is the object layer alone, so your calls work as before. Files packed by 1.x open with either name. |
| `require('memory-compression-jso')` in Node | `require('memory-compression')`; the object layer is `.jso` (or `.objects`). |

API 2 because the module is one file under one name now, and `MemoryCompression.pack(typedArray, { mode: 'small' })` may answer with a smaller container made by the picker. Nothing that was packed before stops opening (checked against files written by memory-compression 1.1.0 and memory-compression-jso 1.4.1).

## How it compares

The numbers and the full list of alternatives are in the two parts below: [part 1](#how-it-compares-1) for bytes and typed arrays (against other compression libraries) and [part 2](#how-it-compares-2) for objects (against JSON text, msgpackr, avsc and others). Two things changed with 2.0.0 and the tables in the parts do not show them: the one file to ship is 270.0 KB (83.5 KB gzipped), where the tables list the two old files separately (about 96 KB for the core, 272 KB for the object layer), and you now pay that download once for both. The speed and size results in the tables were measured on the old files, and 2.0.0 did not change the packing code. Where a speed number was not measured in a browser, its section says so.

## Prior art and credits

Credits, licenses and what was taken are listed with each part: [part 1](#prior-art-and-credits-1) and [part 2](#prior-art-and-credits-2).

## Part 1: bytes and typed arrays

The packing core, as memory-compression 1.x (last version 1.1.0). Headings below are one step down from the old README.

### Quick start
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

### Two modes
| | `mode: 'fast'` (default) | `mode: 'small'` |
|---|---|---|
| Use it for | live memory: pack and restore often, inside a game | save files, undo history, scenes you will not touch for a while |
| Coder | LZ4-class | deflate (the same kind of bits as zip and gzip) |
| Floats and records, size | 39% to 92% of the original | 29% to 82% |
| Speed here (Node, 16 MB) | pack 350 to 870 MB/s, restore 700 to 1150 MB/s | pack 30 to 110 MB/s, restore 270 to 640 MB/s |
| Text | about LZ4 size (40% to 56%) | about the same size as fflate and pako (25% to 38%) |

### Numbers

> **Node numbers.** Tables and sentences that say Node were measured in Node, not in a test browser, so they are not what a visitor's browser does; read them only to compare rows with each other. Rows and sentences named for a browser (ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5) were measured in that browser. Re-measuring the Node ones in the four browsers is not done (open item on `TASKS.md`).
Measured on this machine (4 cores), best of several runs, MB/s counted on the original size; every result was unpacked and compared byte for byte. Cell = size as a share of the original, pack speed, restore speed. Full tables for Node and for each browser are in the review (`REVIEW.md`). Floats here are the hard kind: noisy coordinates, decimals and random walks.

**Version 1.1.0 changed small mode only** (the tables below were measured on 1.0.0): on the same 16 MB sets it packs 1.7 times faster overall (49 to 84 MB/s) and ends 0.6 points smaller overall (55.4% to 54.8%); float and record sets are 0.5 to 2.9 points smaller except random-walk floats, which are 0.5 to 0.9 points bigger. Restore speed and fast mode did not change.

| 16 MB of... | memory-compression fast | memory-compression small | lz4js | fflate level 6 | pako level 6 |
|---|---|---|---|---|---|
| walking float32 values | 56.7% · 666 · 988 | 48.8% · 70 · 486 | 99.8% · 126 · 384 | 74.2% · 17 · 72 | 77.2% · 14 · 80 |
| 28-byte records (positions, colors, ids) | 38.5% · 555 · 835 | 28.9% · 39 · 488 | 72.0% · 79 · 299 | 46.2% · 10 · 111 | 48.6% · 9 · 123 |
| noisy float32 coordinates | 91.5% · 603 · 1099 | 82.0% · 41 · 411 | 100.0% · 237 · 456 | 90.7% · 19 · 75 | 90.1% · 14 · 81 |
| JSON text with coordinates (4 MB) | 40.5% · 309 · 1075 | 25.0% · 33 · 499 | 41.1% · 156 · 265 | 25.9% · 22 · 136 | 24.1% · 16 · 160 |

A 120 MB scene (records, coordinates and text) in Node: kept packed it is 52% of its size in fast mode and 41% in small mode; restoring it takes about 175 ms (fast; 136 ms into a buffer you already have), 340 ms (small), against 525 ms for lz4js, 1.2 s for fflate and 1.6 s for pako. Holding six such scenes took 720 MB raw, 375 MB packed fast and 297 MB packed small (measured in Node, `arrayBuffers`). Without WebAssembly the same fast restore takes about 630 ms.

### What it is not
- **Not a magic fix for noisy floats.** Coordinates with random low digits give up only 10 to 20% (small mode) or about 8% (fast mode). Colors, ids, flags, repeated values and smooth sequences give up 50 to 70%.
- **Not a way to compress what is being drawn this frame.** Restoring a 120 MB scene takes 140 to 250 ms. Use it for data that sits still (other scenes, undo steps, saves, big tables), then restore it when you need it.

### How it compares

Smallest and fastest to restore on floats and records, about as small as fflate and pako on text, much faster to pack than they are, but a bigger download than lz4js or fzstd, and a plain LZ4 in WebAssembly can restore faster on data that does not shrink. The 120 MB scene below is the test (size: smaller is better; times in milliseconds: smaller is better; measured on 1.0.0, and 1.1.0 only changed small mode packing, so the fast row is unchanged).

| Alternative | Size to ship, gzipped (smaller is better) | 120 MB scene: result size, then pack and restore time (Firefox 158 · Chromium 155) | Features | Where it wins or loses |
|---|---|---|---|---|
| memory-compression 1.1.0 (MIT, this module) | About 96 KB, about 33 KB gzipped (not minified; includes the optional WebAssembly helper) | Fast: 52.1%; 375 and 239 ms · 351 and 195 ms. Small: 41.3%; 3731 and 434 ms · 3407 and 351 ms | Floats and records pre-step, `view()` for pieces, LZ4 and deflate formats; no streaming | Wins on floats, records, restore speed and memory; loses on download size and streaming |
| lz4-wasm 0.9.2 (MIT) | 29 KB, 11.6 KB gzipped | 73.6%; 849 and 312 ms · 679 and 226 ms | Plain LZ4 in WebAssembly | Restored faster in WebKitGTK 2.52.6 (123 ms against 221 ms); packs less (73.6%) |
| zstd-wasm 0.0.27 (@bokuweb, MIT), level 3 | 270 KB, 84.5 KB gzipped | 54.0%; 1563 and 626 ms · 1519 and 627 ms | zstd, levels 1 to 22, preset dictionary | Best text size; slower; nothing for floats unless shuffled first |
| fflate 0.8.3 (MIT), level 6 | 33 KB, 12.6 KB gzipped | 51.8%; 12979 and 1549 ms · 11146 and 1415 ms | Zip, streaming, worker threads | Smaller to ship and streams; far slower to pack and restore |
| CompressionStream (the browser's own, deflate-raw) | 0 | 52.6%; 3682 and 439 ms · 4752 and 463 ms | Gzip, deflate; asynchronous only | Costs nothing to ship; cannot be used in the middle of a frame |

pako 3.0.2, lz4js 0.2.0 and fzstd 0.1.1 are in the longer tables below. Not measured: Blosc and the float coders fpzip and ZFP (no browser build to run here).

Where it loses (kept from the longer text below):
- Noisy floats shrink only 8 to 20%; it is no magic fix.
- Too slow to restore in the middle of a frame (140 to 250 ms for 120 MB); use it for data that sits still.
- Bigger download than lz4js (16 KB), fzstd (8.4 KB) and fflate (33 KB) before gzip; no streaming; no preset dictionary.
- On the 120 MB scene, lz4-wasm restored faster in WebKitGTK 2.52.6 (123 ms against 221 ms, smaller is better), and it is the fastest plain LZ4 on data that hardly shrinks (details below).

#### The full comparison
I measured it against fflate 0.8.3, pako 3.0.2, lz4js 0.2.0, **lz4-wasm 0.9.2** (a WebAssembly LZ4), **@bokuweb/zstd-wasm 0.0.27** (a WebAssembly zstd), fzstd 0.1.1 (a plain-JavaScript zstd reader) and the browser's own **CompressionStream**. Same data for every one, every result restored and compared byte for byte. The full tables for each browser are in `REVIEW.md`.

#### Speed and size (Node 22.22.0, 16 MB sets; cell = size · pack MB/s · restore MB/s)

> **Node numbers.** The speeds in this section were measured in Node, not in the four test browsers (ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5), so they are not what a visitor's browser does. Use them to compare rows with each other, not as page speeds. Sizes and counts are exact; only the times depend on the browser. Re-measuring in the four browsers is not done (open item on `TASKS.md`).

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

#### A 120 MB scene, in each browser (pack time · restore time · extra memory)
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

#### What each one is good at, in plain words
- **lz4-wasm** is the fastest plain LZ4 here, and it restores faster than this module on data it cannot shrink or hardly shrinks (noisy floats, prose): up to 1.5 times faster in Node (1.2 GB/s against 0.8 to 1.07). On records and 64-bit floats, where there is something to remove, memory-compression restores as fast or faster (28-byte records 772 against 654 MB/s, float64 957 against 634) and packs faster (513 against 241 MB/s on the records), and it leaves records at 39% instead of 72% and walking floats at 57% instead of 100%. On the 120 MB scene lz4-wasm restored faster only in WebKitGTK (123 ms against 221 ms); in Firefox (312 against 239 ms) and Chromium (226 against 195 ms) memory-compression was faster, and it held the scene in 52% of the space instead of 74%.
- **zstd-wasm** gives the best text size at level 3 (prose 35.8% against 38.2% for small mode, JSON 25.9% against 25.0%), but it is a 270 KB download, restores at 150 to 410 MB/s, and does nothing for floats unless you shuffle first.
- **fflate and pako** are the safe standards: good on text, 12 to 14 KB gzipped, streaming. Level 6 packs at 9 to 16 MB/s and restores at 70 to 160 MB/s here, the slowest of the group; fflate also has a multi-thread mode that this module does not have (not measured).
- **CompressionStream** costs nothing to ship and restores 100 to 335 MB/s in these browsers, packing at 16 to 52 MB/s (faster than fflate and pako at level 6, far slower than the LZ4 class). It is asynchronous only, so it cannot be used in the middle of a frame, and it knows nothing about floats.

#### Features
| | memory-compression 1.1.0 | fflate 0.8.3 | pako 3.0.2 | lz4js 0.2.0 | lz4-wasm 0.9.2 | zstd-wasm 0.0.27 | fzstd 0.1.1 | CompressionStream |
|---|---|---|---|---|---|---|---|---|
| License | MIT | MIT | MIT and Zlib | ISC | MIT (Apache text also shipped) | MIT | MIT | built into the browser |
| Size to ship (gzipped) | 96 KB (33 KB, version 1.1.0); not minified, the WebAssembly helper is included | 33 KB (12.6 KB) | 45 KB (14.0 KB) | 16 KB (4.6 KB), not minified | 29 KB (11.6 KB) | 270 KB (84.5 KB) | 8.4 KB (3.9 KB) | 0 |
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

### API
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

### Good to know
- **Exact, always.** Floats are handled as bytes: NaN payloads, -0 and denormals come back bit for bit.
- **Hostile input is safe to read.** Every read and write is bounds-checked, declared sizes are checked against what is possible (no coder here squeezes more than 1032 to 1), and results above `maxSize` are refused. Damaged or cut-off data throws; flipped bytes either throw or give back wrong bytes of the right length unless you used `check: true` (the format has no per-chunk checksum).
- **The WebAssembly helper is optional.** A page policy without `'wasm-unsafe-eval'` (or an old browser) makes `accelerated()` return `false`; everything still works and gives the same bytes, about 1.5 to 4 times slower. Tested in Firefox 158 and ungoogled Chromium 155 with such a policy. In Chrome the helper is compiled asynchronously, so await `ready()` once at start-up for the fast path from the first call.
- **Memory while packing** is the input, the finished pieces (about the size of the final result) plus the joined result, and about 1 MiB of working space; `unpack` needs the result plus about 1 MiB (nothing extra with `into`). Packing 120 MB peaked about 59 MB lower after the pieces were joined once at the end instead of written into a buffer as big as the input.
- **No streaming, no LZ4 frame format, no preset dictionary** for the standard formats. `gzip` output has no file name and no timestamp.
- The format is this module's own (the first two bytes are `MC`, then a version); a container written by 1.x is read by every later 1.x.

### Prior art and credits
No code from others; the ideas below are theirs. The JavaScript and the C source of the WebAssembly helper were written for this repository (LFC Foundry, MIT); the LZ4-class and deflate coders are written for this module.
- **LZ4 block format**, by Yann Collet: this module reads and writes the standard format, so other LZ4 tools can read its blocks. Format only, no code taken.
- **deflate, zlib and gzip formats** (RFC 1951, 1950 and 1952): standard formats, written from scratch, tested against Node's zlib, fflate and pako.
- **Byte shuffle before compressing**: the idea comes from Blosc (a C library that shuffles bytes and then compresses them with LZ4 or zstd). Idea only, no code taken. Blosc was not measured.
- **Column difference step**: a common idea for numeric tables; no code taken.
- fflate, pako, lz4js, lz4-wasm, @bokuweb/zstd-wasm, fzstd and the browser's CompressionStream were run as comparisons only; nothing from them ships here (the test pages inline them for measuring).

### For AI agents
- Use `pack`/`unpack` for typed arrays you want to keep in memory compactly or save; pass `width` equal to the record size in bytes whenever the array is rows of the same shape; use `mode: 'small'` for anything restored rarely, `'fast'` for anything restored often.
- Keep many packed things and restore one at a time with `unpack(packed, { into: reusableBuffer })`. For one huge array, `pack` with a `chunk` of 256 KiB to 1 MiB and read pieces with `view()`.
- Await `MemoryCompression.ready()` once at start-up. Never assume the data is smaller: random-looking floats give up only 10 to 20%; check `packed.length`.
- Do not use it for what is drawn every frame. Do not add a second compression library next to it; its `deflate`/`inflate`/`gzip`/`lz4Compress` replace fflate, pako and lz4js for what they do here.
- To rebuild the WebAssembly helper: `sh wasm/build.sh && python3 wasm/embed.py` (needs clang with the wasm32 target). The JavaScript and WebAssembly paths must stay byte-identical; the tests check that.

## Part 2: plain JavaScript objects

The object layer, as memory-compression-jso 1.x (last version 1.4.1). It reaches the packing core of part 1 for its number columns.

### Quick start
```js
var links = [{ id: 0, from: 0, to: 7, weight: 0.25, x1: 12.5, y1: -3.75, color: 4281558988, kind: 'flow', hot: false } /* , 299,999 more */];
var packed = MemoryCompressionJSO.pack(links);            // a Uint8Array: about 14% of the JSON text for 300,000 links like these
links = null;                                             // free the objects
var back = MemoryCompressionJSO.unpack(packed);           // equal objects again: same values, same key order, same -0 and NaN
```
Keep it packed and read single items without making the others (for a packed array of objects that all have the same keys; with fewer than 16 objects the list is simply restored whole, the calls are the same):
```js
var v = MemoryCompressionJSO.view(packed);                // decodes the columns once, makes no objects
v.length;  v.keys;                                        // 300000, ['id', 'from', ...]
v.get(4711);                                              // one object, built on the spot
v.field(4711, 'weight');                                  // one value
v.column('x1');                                           // the whole column as a Float64Array (or a plain array for text)
```
A view opens in well under a millisecond (about 0.05 ms for 300,000 links; 1.0.0 took about 29 ms) because a column is restored only the first time it is read. `v.loaded()` lists the restored columns, `v.memory()` says how many bytes that is, and `v.release()` lets them go again.

Objects that point at each other (links holding the very node objects) come back sharing, and a graph is stored by column, not value by value:
```js
var packed = MemoryCompressionJSO.pack({ nodes: nodes, links: links }, { refs: true });   // links[i].from === nodes[k] stays true after unpack()
```
Text that follows a pattern (`'user7@example.org'`, `'2025-03-05T04:15:00Z'`, `'Item 12 flow'`) is stored as the pattern once plus a column of numbers, with no option to set. `{ patterns: false }` turns that off (faster to pack text-heavy data, bigger result). `{ float32: true }` keeps columns of fractions in 4 bytes per value instead of 8: lossy (the relative error is at most about 6 in 100 million), so it is off unless you ask.

`MemoryCompressionJSO.ready()` is a promise that resolves when the fast WebAssembly path has been chosen; calls made earlier still work, in plain JavaScript.


### What it handles
Numbers (whole numbers, decimals, 32-bit and 64-bit floats, `NaN`, infinities, `-0`), text (including lone surrogates and a leading byte-order mark), booleans, `null`, `undefined`, `BigInt`, `Date`, `Map`, `Set`, `RegExp`, typed arrays (not the 64-bit ones), `ArrayBuffer`, nested arrays and objects, sparse arrays (holes come back as `undefined`), keys of any kind including `__proto__`, and null-prototype objects. Shared objects and cycles come back with `refs: true`.

### How it works (plain words)
- An array of 16 or more things is stored **by column**. A list of link objects becomes one list of ids, one of `from`, one of `weight`, and so on, and the key names are written once.
- Each column picks the cheapest way to hold its values: one repeated value, whole numbers in the narrowest width, decimals such as 12.34 or 0.25 as whole numbers with a scale (so 0.25 steps cost 1 or 2 bytes each, not 8), 32-bit floats when that loses nothing, plain 64-bit floats, a yes/no bit each, a dictionary for repeated text, joined text, and arrays of small fixed-length arrays (such as `[lat, lng]`) as one column per position.
- The number columns then go through [memory-compression](#part-1-bytes-and-typed-arrays) (byte shuffle, column difference, then LZ4 in fast mode or deflate in small mode), which is where the float savings come from.
- **Text patterns (new in 1.1.0).** When most strings in a column look alike (`'user' + number + '@example.org'`), the text between the numbers is kept once and each number goes into a number column. Up to 32 patterns per column. For big columns a 608-byte WebAssembly helper walks the bytes; the plain-JavaScript loop does the same work and writes the same bytes.
- **Sorted text (new in 1.3.0).** Rows that share their start with the row above store only the new end: about 31 to 41% smaller on word lists and file paths, kept only when 15% or more is saved (section below).
- **Dates and times (new in 1.2.0).** A text column of ISO dates (`2025-03-05T04:15:00Z`, with milliseconds, `2025-03-05`, or a space instead of the `T`) is stored as one number per row (days, minutes, seconds or milliseconds since 1970) instead of six, and rebuilt as the same text. Every row is checked to be a real date (no 30 February, no 24:00); one row that is not keeps the whole column on the older pattern path. Sorted timestamps become tiny differences, so files are 13 to 31% smaller (smaller is better, table below).
- **Shared objects by column (new in 1.1.0).** With `refs: true`, a column whose values are objects that were already written (links pointing at nodes) is stored as a column of ids, not value by value.
- Anything that does not fit a pattern (mixed types, odd objects) is written in a general form, value by value, so every input works; it is just bigger and slower there (see "What it is not").
- Packing builds small generated functions per object layout (with `new Function`; plain loops are used where that is blocked), which is what makes both directions fast on repeated layouts.

### Numbers
How to read these: every table says which direction is better. **Size** is the packed result in megabytes (smaller is better). **Pack** is the time to turn the objects into bytes and **unpack** the time to turn the bytes back into objects, in milliseconds (smaller is better). Bold is the best in that column among the packers (not JSON text). Every result was restored and compared value for value (NaN equals NaN, -0 differs from 0, key order counts, `undefined` is a value, prototypes must match).

Measured in Node 22.22.0 (4 cores), best of 3 runs with a full garbage collection before each; the data sets are generated by `test/data.js`. Timings in one run vary by about 30% either way, so treat differences under that as ties. The 1.0.0 rows are the previous release run in the same pass.

**nfm-links: 300,000 network links** (57.26 MB as JSON text)

| library | size, MB (lower is better) | pack, ms (lower is better) | unpack, ms (lower is better) | restored exactly? |
|---|---:|---:|---:|---|
| this module 1.1.0, fast mode | 7.854 | 99.6 | 72.9 | yes |
| this module 1.1.0, small mode | **6.716** | 216.5 | 75.9 | yes |
| this module 1.0.0, fast mode | 7.854 | 106.7 | **60.6** | yes |
| msgpackr with records | 20.005 | 153.1 | 121.8 | yes |
| cbor-x with records | 20.905 | 182.7 | 136.4 | yes |
| avsc (Avro; needs a schema) | 18.767 | **85.3** | 137.8 | values yes; its own record class |
| Node's v8.serialize | 40.659 | 291.1 | 413.7 | yes |
| JSON text | 57.258 | 500.4 | 395.2 | yes |

**nfm-nodes: 100,000 scene items** (22.21 MB as JSON text)

| library | size, MB (lower is better) | pack, ms (lower is better) | unpack, ms (lower is better) | restored exactly? |
|---|---:|---:|---:|---|
| this module 1.1.0, fast mode | 2.099 | 65.4 | 64.2 | yes |
| this module 1.1.0, small mode | **1.840** | 114.2 | **40.9** | yes |
| this module 1.0.0, fast mode | 2.652 | 64.8 | 66.1 | yes |
| msgpackr with records | 8.706 | 59.5 | 71.6 | yes |
| cbor-x with records | 9.315 | 75.1 | 101.0 | yes |
| avsc (Avro; needs a schema) | 8.958 | **52.8** | 74.7 | values yes; its own record class |
| Node's v8.serialize | 18.525 | 115.6 | 305.7 | yes |
| JSON text | 22.206 | 174.3 | 169.5 | yes |

**api-users: 50,000 user records with lots of text** (11.06 MB as JSON text)

| library | size, MB (lower is better) | pack, ms (lower is better) | unpack, ms (lower is better) | restored exactly? |
|---|---:|---:|---:|---|
| this module 1.1.0, fast mode | 0.764 | 63.5 | 73.1 | yes |
| this module 1.1.0, small mode | **0.626** | 81.9 | 50.5 | yes |
| this module 1.0.0, fast mode | 1.080 | 64.7 | 61.7 | yes |
| msgpackr with records | 5.754 | 54.6 | **38.4** | yes |
| cbor-x with records | 6.054 | 65.9 | 47.5 | yes |
| avsc (Avro; needs a schema) | 5.508 | **40.7** | 50.0 | values yes; its own record class |
| Node's v8.serialize | 10.900 | 76.4 | 147.8 | yes |
| JSON text | 11.060 | 59.5 | 85.0 | yes |

**geojson: 20,000 map features** (10.32 MB as JSON text)

| library | size, MB (lower is better) | pack, ms (lower is better) | unpack, ms (lower is better) | restored exactly? |
|---|---:|---:|---:|---|
| this module 1.1.0, fast mode | 1.803 | 34.6 | 62.5 | yes |
| this module 1.1.0, small mode | **1.516** | 102.1 | 64.2 | yes |
| this module 1.0.0, fast mode | 1.885 | 47.6 | 68.9 | yes |
| msgpackr with records | 7.212 | **31.5** | **61.9** | yes |
| cbor-x with records | 7.385 | 43.3 | 67.5 | yes |
| avsc (Avro; needs a schema) | 6.809 | 45.8 | 65.7 | values yes; its own record class |
| Node's v8.serialize | 12.307 | 133.4 | 204.3 | yes |
| JSON text | 10.319 | 101.8 | 96.6 | yes |

**events: 200,000 log events** (20.19 MB as JSON text)

| library | size, MB (lower is better) | pack, ms (lower is better) | unpack, ms (lower is better) | restored exactly? |
|---|---:|---:|---:|---|
| this module 1.1.0, fast mode | 1.670 | 77.5 | 61.9 | yes |
| this module 1.1.0, small mode | **1.215** | 117.0 | 44.3 | yes |
| this module 1.0.0, fast mode | 2.481 | 73.5 | **43.5** | yes |
| msgpackr with records | 9.569 | 96.2 | 49.8 | yes |
| cbor-x with records | 10.362 | 113.1 | 62.3 | yes |
| avsc (Avro; needs a schema) | 8.836 | **66.3** | 54.4 | values yes; its own record class |
| Node's v8.serialize | 17.228 | 86.1 | 176.9 | yes |
| JSON text | 20.191 | 110.7 | 109.3 | yes |

**small: 1,000 small objects** (0.12 MB as JSON text)

| library | size, MB (lower is better) | pack, ms (lower is better) | unpack, ms (lower is better) | restored exactly? |
|---|---:|---:|---:|---|
| this module 1.1.0, fast mode | **0.007** | 0.9 | **0.2** | yes |
| this module 1.1.0, small mode | **0.007** | 1.3 | **0.2** | yes |
| this module 1.0.0, fast mode | 0.011 | 0.5 | **0.2** | yes |
| msgpackr with records | 0.048 | 0.6 | 0.4 | yes |
| cbor-x with records | 0.054 | 0.7 | 0.3 | yes |
| avsc (Avro; needs a schema) | 0.041 | **0.2** | 0.3 | values yes; its own record class |
| Node's v8.serialize | 0.100 | 0.7 | 1.2 | yes |
| JSON text | 0.120 | 0.7 | 0.9 | yes |

**irregular: 20,000 items, every one different** (0.40 MB as JSON text)

| library | size, MB (lower is better) | pack, ms (lower is better) | unpack, ms (lower is better) | restored exactly? |
|---|---:|---:|---:|---|
| this module 1.1.0, fast mode | 0.150 | 8.9 | 9.0 | yes |
| this module 1.1.0, small mode | **0.123** | 31.3 | 13.4 | yes |
| this module 1.0.0, fast mode | 0.150 | 17.5 | 12.1 | yes |
| msgpackr with records | 0.223 | 12.4 | 14.9 | yes |
| cbor-x with records | 0.246 | 8.0 | **7.9** | yes |
| Node's v8.serialize | 0.366 | **4.3** | 8.6 | yes |
| JSON text | 0.401 | 3.9 | 6.0 | yes |

What the Node tables say, in plain words:
- **Size:** compared with 1.0.0, text-heavy sets are smaller: the 50,000 user records went from 1.080 MB to 0.764 MB (29% smaller), the 200,000 events from 2.481 MB to 1.670 MB (33% smaller), the 100,000 scene items from 2.652 MB to 2.099 MB (21% smaller). Number-only sets (the 300,000 links) are the same size. Against msgpackr with records the files are 1.5 to 7.5 times smaller in fast mode (1.5 times on the irregular set, 7.5 on the user records).
- **Speed in fast mode is about the same as 1.0.0** (differences are inside the 30% noise) and the same class as msgpackr with records. avsc (which needs a schema) packs fastest on four of the five big sets (this module is 1.2 to 1.6 times slower there; on the map features this module packs 1.3 times faster); this module unpacks faster than avsc on the links (1.9 times) and the scene items (1.2 times), and is even or up to 1.5 times slower on the other three.
- **Small mode packs faster than 1.0.0 on text-heavy sets** (events 174 to 117 ms, scene items 145 to 114 ms, users 96 to 82 ms) and is smaller still.
- **Where it is not the best:** on the 50,000 user records (lots of short text) msgpackr with records unpacks 1.9 times faster (38 ms against 73 ms) and avsc packs 1.6 times faster (41 ms against 64 ms); the file is 7.5 times smaller than either.

#### Dates and times (1.2.0)
Sizes, packing and unpacking of a text column of ISO dates, 1.1.1 against 1.2.0. Browser rows are 20,000 rows, median of 15 alternating rounds; Node rows are 50,000 rows, best of 9. **Smaller is better in every column.**

| Data | Size 1.1.1 | Size 1.2.0 | Smaller by |
|---|---:|---:|---:|
| Sorted log timestamps, whole seconds (Node, 50,000) | 49.6 KB | 39.3 KB | 21% |
| Sorted log timestamps, milliseconds (Node, 50,000) | 134.5 KB | 117.3 KB | 13% |
| Random dates and times in one year (Node, 50,000) | 241.5 KB | 181.2 KB | 25% |
| Random dates only, 5 years (Node, 50,000) | 127.2 KB | 88.0 KB | 31% |
| One timestamp every hour, steady (Node, 50,000) | 87.2 KB | 87.2 KB | 0% (kept as before) |
| Sorted log timestamps, whole seconds (browsers, 20,000) | 20.4 KB | 15.9 KB | 22% |
| Random dates only (browsers, 20,000) | 51.9 KB | 35.8 KB | 31% |

| Browser (20,000 sorted log timestamps, whole seconds) | Pack 1.1.1 | Pack 1.2.0 | Unpack 1.1.1 | Unpack 1.2.0 |
|---|---:|---:|---:|---:|
| Firefox 158.0 | 3.6 ms | 3.8 ms | 2.7 ms | 1.4 ms |
| ungoogled Chromium 155.0.8059.39-1 | 4.9 ms | 4.9 ms | 1.6 ms | 1.3 ms |
| WebKitGTK 2.52.6 | 6.9 ms | 6.0 ms | 2.3 ms | **3.6 ms** |
| GNOME Web 46.5 | 8.3 ms | 6.5 ms | 2.5 ms | **3.3 ms** |

With milliseconds (20,000 rows) unpacking goes 2.9 to 1.6 ms in Firefox, 2.2 to 1.4 ms in Chromium, and **3.2 to 5.2 ms** in WebKitGTK (**3.0 to 4.8 ms** in GNOME Web); packing goes 10.4 to 6.8 ms in WebKitGTK. Unpacking dates is about 1.5 to 2 times faster in Firefox and Chromium and about 1.4 to 1.7 times **slower** in the two WebKit browsers for the same file-size win; random dates unpack faster everywhere (WebKitGTK 4.3 to 3.6 ms). WebKit is slow here because it builds the date text with more string-joining work per row than the old way; a first attempt at a fix (tables made without holes) recovered part of it. A date column is used only when one number is expected to cost no more than the separate ones: the made-up cyclic dates of the `api-users` test set stay as before (155.4 KB, same speed), and a steady one-per-hour column also stays as before.

#### Sorted text, stored as "what is shared with the row above" (front coding, `front`, 1.3.0)
When a text column is sorted (words, file paths, city names, IDs in order), each row starts with the same letters as the row before. 1.3.0 stores, for each row, how many leading characters it shares with the row above and then only the new end (`/usr/share/doc/pkg1/` then `a.txt`). It is on by default, tried only when the first 1,024 neighbors share a quarter of their characters, judged on the first 2,048 rows of a big column, and **kept only when the column comes out at least 15% smaller** (a smaller win is not worth the extra time to read it back). `{ front: false }` turns it off. The cut never falls between the two halves of an emoji; plain ASCII text is handled directly on the bytes. A file that uses it says format 4 and 1.2.x refuses it with "made by a newer version"; every other file is written exactly as before. The price: those columns take about 1.3 to 1.8 times as long to pack and about 1.2 to 2.2 times as long to read. Medians of 5 alternating rounds, one browser at a time, fresh page per set; the data are real file paths from `/usr` and `/opt` and the word list of the common license texts.

**40,000 sorted file paths** (beside a number column): 421038 bytes with 1.2.0, **247037 bytes** with 1.3.0 (**-41.3%**, smaller is better).

| Browser | Unpack 1.2.0 to 1.3.0 (smaller is better) | Pack 1.2.0 to 1.3.0 (smaller is better) |
|---|---|---|
| Firefox 158.0 | 13.95 ms to 19.86 ms | 17.9 ms to 27.9 ms |
| Chromium 155.0.8059.39-1 | 7.60 ms to 9.54 ms | 20.7 ms to 27.8 ms |
| WebKitGTK 2.52.6 | 5.67 ms to 7.33 ms | 19.0 ms to 25.3 ms |
| GNOME Web 46.5 | 6.14 ms to 9.57 ms | 20.5 ms to 26.5 ms |

**30,695 sorted words** (beside a number column): 196618 bytes with 1.2.0, **136196 bytes** with 1.3.0 (**-30.7%**, smaller is better).

| Browser | Unpack 1.2.0 to 1.3.0 (smaller is better) | Pack 1.2.0 to 1.3.0 (smaller is better) |
|---|---|---|
| Firefox 158.0 | 3.13 ms to 4.55 ms | 4.8 ms to 6.2 ms |
| Chromium 155.0.8059.39-1 | 2.31 ms to 3.49 ms | 4.5 ms to 6.0 ms |
| WebKitGTK 2.52.6 | 3.62 ms to 5.50 ms | 7.1 ms to 10.3 ms |
| GNOME Web 46.5 | 3.23 ms to 7.23 ms | 7.3 ms to 9.3 ms |

**Date text (whole milliseconds, 20,000 rows), unpack 1.2.0 to 1.3.0 (smaller is better):** Firefox 158.0 2.93 to 2.87 ms, Chromium 155.0.8059.39-1 1.64 to 1.65 ms, WebKitGTK 2.52.6 4.62 to 2.46 ms, GNOME Web 46.5 5.77 to 2.77 ms. Whole seconds: Firefox 158.0 2.49 to 2.09 ms, Chromium 155.0.8059.39-1 1.08 to 1.27 ms, WebKitGTK 2.52.6 1.92 to 1.85 ms, GNOME Web 46.5 2.15 to 2.08 ms (no change beyond noise).

Unsorted file paths (the same 40,000 shuffled) are left alone: the file is byte for byte the same as 1.2.0 and packing costs Firefox 158.0 21.9 to 24.1 ms, Chromium 155.0.8059.39-1 36.1 to 36.5 ms, WebKitGTK 2.52.6 27.0 to 31.0 ms, GNOME Web 46.5 29.5 to 30.5 ms for the quick look that rejects the column.

**Date fix (1.3.0).** Milliseconds dates were slower to rebuild in WebKit than in the other engines because one loop mixed arithmetic with joining text, which JavaScriptCore runs about 3 times slower than a loop that only joins. 1.3.0 does it in two passes (numbers first, then a generated join loop). Fusing the dictionary lookup into the text splitter was also tried; it measured as noise (-0.4% to +2.9% pack time) and was not kept.

#### Short, varied text kept as FSST codes (`fsst: true`, 1.2.0)
FSST (a text compressor from the VLDB 2020 paper by Boncz, Neumann and Leis) learns up to 255 common pieces of text from the column itself (a piece is 1 to 8 bytes: " Street", "ville", "@exam") and writes each string as a short list of piece numbers. Two things follow: the column is about half the size of the same text packed the old way, and **one string can be read without restoring the others**, so a `view()` keeps such a column at about a third of its restored size. It is off unless you pass `{ fsst: true }`, because training costs time when packing. Each text column is tried both ways and the smaller is kept; columns that are patterns (`user7@example.org`) or small dictionaries (`'flow'`, `'stock'`) keep their own, smaller way. A text file with an FSST column says format 3.

Same data in every browser, 20,000 rows unless it says 100,000 (smaller is better for every column except "reads", where it says). The kernel is a 3 KB WebAssembly program for the learning-free parts (turning text into codes and back) used at 4,096 rows and up; the "JavaScript only" columns are the same bytes without it.

| Data | File, plain | File, FSST | Smaller by | Restored size, plain | Restored size, FSST | Smaller by |
|---|---:|---:|---:|---:|---:|---:|
| Names and cities | 180.5 KB | 89.3 KB | 51% | 555 KB | 166 KB | 70% |
| Invented words | 119.4 KB | 56.8 KB | 52% | 323 KB | 122 KB | 62% |
| File paths | 247.1 KB | 110.3 KB | 55% | 645 KB | 180 KB | 72% |
| Log messages | 234.5 KB | 153.9 KB | 34% | 875 KB | 225 KB | 74% |
| Names and cities, 100,000 rows | 902.0 KB | 423.8 KB | 53% | 2,777 KB | 810 KB | 71% |
| Item labels ("Item 12 flow") | 0.5 KB | 0.5 KB | not used (the pattern is smaller) | 449 KB | 449 KB | 0% |

| Names and cities, 20,000 rows | Pack plain | Pack FSST (kernel) | Pack FSST (JavaScript only) | Unpack plain | Unpack FSST (kernel) | Unpack FSST (JavaScript only) | Open and read the first field, plain | Open and read the first field, FSST |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Firefox 158.0 | 4.1 ms | 18.3 ms | 28.7 ms | 4.8 ms | 6.1 ms | 7.2 ms | 4.75 ms | **0.53 ms** |
| ungoogled Chromium 155.0.8059.39-1 | 5.5 ms | 17.2 ms | 25.2 ms | 1.8 ms | 2.2 ms | 4.0 ms | 1.11 ms | **0.74 ms** |
| WebKitGTK 2.52.6 | 5.6 ms | 18.7 ms | 24.6 ms | 2.1 ms | 2.1 ms | 3.7 ms | 1.14 ms | **0.71 ms** |
| GNOME Web 46.5 | 5.3 ms | 19.0 ms | 23.5 ms | 2.0 ms | 2.2 ms | 3.1 ms | 1.60 ms | **0.60 ms** |
| Node 22.22.0 | 4.3 ms | 17.2 ms | 25.8 ms | 2.0 ms | 2.3 ms | 5.1 ms | 1.10 ms | **0.67 ms** |

At 100,000 names and cities the kernel unpacks in 8.4 ms in Chromium against 26.5 ms in JavaScript (3.2 times faster), 8.3 ms against 21.0 ms in WebKitGTK, 27.5 ms against 37.8 ms in Firefox (1.4 times faster). Reading one string alone takes 0.15 to 0.55 microseconds in every browser. **What it costs:** packing is 1.9 to 6.4 times slower (the learning step: 5 rounds over a 16 KB random sample); unpacking everything is 1.0 to 1.6 times slower than the plain way; the gain is size, memory and the ability to read one string. It does not beat the old way where the same whole values repeat (country names in 100,000 rows: those stay a dictionary, chosen automatically).

The kernel needs a page that allows WebAssembly (`'wasm-unsafe-eval'`); without it, or with `{ wasm: false }`, the JavaScript does the same work and writes the same bytes (checked). Kernel source: `wasm/jso-kernels.c`; rebuild with `wasm/build.sh` (clang 18.1.3) then `wasm/embed.py` and `build.py`; 3,323 bytes, sha256 starting 57424e85, identical when built again in a different folder.

#### Number columns picked one block at a time (`mode: 'balanced'` or `'small'`, 1.4.0)
In the default `fast` mode a number column goes straight to the byte packer. In `balanced` and `small` mode each block of 8,192 numbers is tried several ways on a sample and the smallest is written: constant, offset and width, differences, runs, a small table of values, a few big exceptions, a shared divisor, entropy coding, decimals stored as whole numbers (a value that is off by float noise, such as 0.30000000000000004, is stored as its distance from the decimal), the raw 8 bytes, and byte planes (the same byte of every number together, each plane stored the cheapest way). Text columns whose codes are numbers go through the same chooser. Columns under 1,024 values, and columns the chooser gains less than 5% on in a first trial, keep the old way and cost almost nothing. Every kind is checked on read: damaged blocks give a clean error, never wrong numbers. `small` mode also tries deflate over the result and keeps whichever is smallest.

100,000 numbers per column, `fast` against `balanced`. **Smaller is better.** The sizes are identical in all four browsers and Node.

| Column | `fast` | `balanced` | Change |
|---|---:|---:|---:|
| ids 0, 1, 2 ... | 1,635 B | 121 B | -92.6% |
| timestamps rising by 1 to 3 | 71,052 B | 20,548 B | -71.1% |
| prices with 2 decimals | 132,045 B | 97,214 B | -26.4% |
| coordinates with 5 decimals | 117,243 B | 81,760 B | -30.3% |
| temperatures with 1 decimal | 96,969 B | 53,295 B | -45.0% |
| 4 decimals plus float noise | 621,672 B | 242,229 B | -61.0% |
| random doubles | 359,742 B | 359,742 B | 0.0% (nothing to find; kept as is) |

Time, in milliseconds, **lower is better**, median of 5 rounds in each browser, one browser at a time. The pack time is the cost: the chooser tries many ways.

| Browser | timestamps unpack fast / balanced | timestamps pack fast / balanced | prices unpack | prices pack | float-noise unpack | float-noise pack |
|---|---:|---:|---:|---:|---:|---:|
| Firefox 158.0 | 2.2 / 4.9 | 1.8 / 17.8 | 1.3 / 4.0 | 2.0 / 15.8 | 1.1 / 4.0 | 2.2 / 36.6 |
| ungoogled Chromium 155.0.8059.39-1 | 1.3 / 4.9 | 1.9 / 21.4 | 2.1 / 7.9 | 3.5 / 21.5 | 0.8 / 7.4 | 2.8 / 52.5 |
| WebKitGTK 2.52.6 | 1.7 / 3.2 | 1.4 / 17.0 | 4.5 / 4.4 | 4.8 / 17.0 | 1.7 / 4.5 | 1.8 / 33.0 |
| GNOME Web 46.5 | 1.6 / 2.8 | 1.3 / 14.6 | 5.1 / 4.4 | 5.2 / 17.0 | 1.8 / 5.0 | 1.8 / 40.0 |

**Whole lists of objects, measured in Node 22 (not in a test browser; compare rows only), `fast` / `balanced` / `small`** (size smaller is better; times lower is better; results come back exactly in every case):

| Data | Size KB fast | balanced | small | Pack ms fast / balanced / small | Unpack ms fast / balanced / small |
|---|---:|---:|---:|---|---|
| 300,000 links | 7,670 | 6,413 (-16.4%) | 6,396 (-16.6%) | 87 / 624 / 1,581 | 219 / 99 / 146 |
| 100,000 graph nodes | 2,050 | 1,733 (-15.5%) | 1,701 (-17.0%) | 75 / 209 / 424 | 40 / 52 / 48 |
| 200,000 log events | 1,631 | 1,175 (-28.0%) | 1,102 (-32.5%) | 76 / 204 / 345 | 33 / 39 / 35 |
| 50,000 user records | 746 | 614 (-17.7%) | 578 (-22.5%) | 53 / 122 / 247 | 41 / 29 / 38 |
| 20,000 map features | 1,761 | 1,367 (-22.4%) | 1,359 (-22.9%) | 26 / 106 / 333 | 29 / 35 / 45 |

**Plain takeaway:** `balanced` makes number-heavy data 15 to 28% smaller; reading it back takes about the same time (0.7 to 1.7 times) and packing takes 2 to 7 times longer than `fast` (300,000 links 94 ms against 501 ms in Node). Use it for data that is packed once and kept (a layout parked while memory is tight); keep `fast` for data packed over and over. (1.4.0 packed 7 to 24 times slower; the 1.4.1 speed pass cut that, see the changelog. Columns of real-valued doubles: 4 × 200,000 values pack in about 105 ms against 336 ms in 1.4.0, same bytes. `small` mode: five 100,000-row lists pack in 1,440 ms against 2,343 ms before this pass (warm, Node), 0.003% bigger.)

#### Keeping data packed under memory pressure (`keeper`, 1.4.0)
`keeper(opts)` holds named values packed, restores them when asked and lets go of the restored copies when a budget is passed or `trim()` is called, least recently used first. `opts.budget` is the most bytes it may hold (packed bytes plus restored copies; 0 means no limit), `opts.onPressure(level, memory)` is called when the level changes (0 fine, 1 at 70% of the budget, 2 at or over it), and every other option (`mode`, `refs`, `fsst`, ...) is used when packing.
```js
var K = MemoryCompressionJSO.keeper({ budget: 600e6, mode: 'balanced', refs: true, onPressure: function (level, mem) { /* 0, 1 or 2 */ } });
K.hold('layout', layout);                 // packs it; let go of your own copy
K.pin('scene'); /* draw */ K.unpin('scene');   // while pinned, never trimmed or released
K.restore('layout').then(function (layout) { /* restored in slices; the page stayed free */ });
K.trim(); K.release();                    // let go of restored copies (the packed bytes stay)
```
| Call | What it does |
|---|---|
| `hold(name, value, opts?)` | packs and keeps the packed form; returns `{ packed, heap }` (heap = estimated live size). Per-call `opts` override the keeper's (`refs: true` passes through) |
| `get(name)` | the value, restored now (the page waits) and kept; `view(name)` and `column(name, key)` read parts without making the objects |
| `restore(name, { sliceMs: 8 }?)` | a promise of the same value, restored in slices of about 8 ms so the page stays free (a packed array of objects: columns one at a time, then objects 512 at a time); anything else is restored in one step on the page |
| `each(name, fn, { chunk: 2048, sliceMs: 8 }?)` | a promise that calls `fn(objects, firstRow)` for each run of rows of a packed array of objects, with the page free in between; **the whole list is never made at once**, so only a run of objects plus the opened columns are alive: for 300,000 links 17 MB of extra live memory in Node against 66 to 68 MB for `get()` or `restore()` (lower is better), finished in 48 to 170 ms with the longest page freeze 17 to 27 ms in the four browsers. `view(name).slice(from, to)` makes just those rows |
| `pin(name)`, `unpin(name)` | counts; a pinned item is skipped by `trim()`, the budget, `release()` and `drop()` (pass `true` as the second argument of `release` or `drop` to force) |
| `calibrate(factor)` | multiply the live size of restored data by a measured factor (a browser page can cost 2.5 times what a plain heap count says); no argument reads it |
| `memory()` | `{ packed, restored, total, budget, factor, items: { name: { packed, restored, rows, pinned, restoreMs, restoreMsMeasured, restoredBy } } }`; `restoreMs` is measured after the first restore and guessed from the packed size before |
| `trim(target?)`, `release(name?)`, `drop(name)`, `level()`, `names()`, `has()`, `touch()` | housekeeping |
| `bytes(name)`, `adopt(name, bytes, heap?)` | take the packed bytes out (to unpack in your own worker) or keep bytes packed elsewhere |
| `heap()` | what the browser tells: `usedJSHeap` and `jsHeapLimit` in Chromium only, `deviceMemoryGB` where offered; Firefox and Safari tell nothing, so the keeper's own count (`memory()`) is what to rely on |

`MemoryCompressionJSO.estimateBytes(value)` guesses the live size of a value (usually within a third). `MemoryCompressionJSO.profile(value, opts, repeats)` returns `{ bytes, packMs, unpackMs, format, parts }` where `parts` says which column took how long and how many bytes: the starting point for speeding up packing.

**Reading single items while packed** (300,000 links, 7.85 MB packed; `view()`): opening takes 0.0 to 0.14 ms; the first read opens the columns (36 to 115 ms); each read after that takes 0.2 to 0.7 microseconds in all four browsers (the first study's 220 microseconds per link was the cold cost); reading one field with `field(i, key)` takes 0.05 to 0.4 microseconds.

**Getting the value back without freezing the page** (300,000 links, median of 3, one browser at a time; **lower is better**):

| Browser | `get()`: page frozen for | `restore()`: finished after | `restore()`: longest freeze |
|---|---:|---:|---:|
| Firefox 158.0 | 76 ms | 138 ms | 26 ms |
| ungoogled Chromium 155.0.8059.39-1 | 68 ms | 109 ms | 31 ms |
| WebKitGTK 2.52.6 | 54 ms | 81 ms | 21 ms |
| GNOME Web 46.5 | 53 ms | 91 ms | 21 ms |

A worker was tried first and dropped: unpacking in a worker and sending the objects back froze the page for 187 to 299 ms (the copy of the finished objects runs on the page) and took 5 to 10 times longer in all (Chromium 155). To restore elsewhere, take `bytes(name)` to your own worker and send back typed arrays, not objects. A packed value that is not an array of objects (a layout object holding a few arrays) is restored in one step; hold its arrays as separate items to get the slices.

#### A graph where links hold the node objects (`refs: true`)
100,000 items and 300,000 links that point at the item objects themselves (not copies); JSON text of the same, with the links copied, is 101.6 MB. Same rules: smaller is better in every column.

| library | size, MB | pack, ms | unpack, ms | links still point at the very same objects? |
|---|---:|---:|---:|---|
| this module 1.1.0, small mode | **2.14** | 332 | **107** | yes |
| this module 1.1.0, fast mode | 2.49 | 228 | 122 | yes |
| this module 1.0.0, fast mode | 5.78 | 484 | 166 | yes |
| msgpackr (structuredClone on) | 11.49 | 581 | 305 | yes |
| cbor-x (structuredClone on) | 11.70 | 680 | 208 | no: it handed back a wrong value |
| Node's v8.serialize | 21.57 | **167** | 294 | yes |
| JSON text | 101.59 | 1169 | 914 | no: links become copies |

Takeaway: with shared objects, 1.1.0 is 2.3 times smaller and 2.1 times faster to pack than 1.0.0, 4.6 times smaller than msgpackr, and only v8.serialize (which is Node-only and 8.7 times bigger) packs faster.

#### In the browsers
Same code, same checks, smaller sets (so the page finishes in about a minute): 60,000 links, 20,000 items, 10,000 users, 4,000 features, 40,000 events, 1,000 small, 4,000 irregular. Best of 12 runs, then the better of two passes. Firefox 158.0 ran with timer rounding switched off so milliseconds are real; the WebKit timer counts whole milliseconds, so small cells there are rough. Times are milliseconds (smaller is better), sizes are megabytes (smaller is better). Because the page runs one library after another, a library that goes first or right after a heavy one can look slower than it is; the table that follows (the pairs run alternately) is the fair comparison of 1.1.0 with 1.0.0.

**Firefox 158.0**

| data set (items) | this module 1.1.0 fast: pack / unpack, ms | this module 1.0.0 fast: pack / unpack, ms | msgpackr with records: pack / unpack, ms | size, MB: this module 1.1.0 / msgpackr |
|---|---|---|---|---|
| nfm-links (60,000) | 19.3 / 6.8 | 21.8 / 5 | 25 / 16 | 1.553 / 3.822 |
| nfm-nodes (20,000) | 10.9 / 4.3 | 10.5 / 4 | 12 / 9.7 | 0.437 / 1.697 |
| api-users (10,000) | 7.6 / 4.1 | 8.6 / 3.7 | 8.1 / 9.6 | 0.155 / 1.142 |
| geojson (4,000) | 5.7 / 5.1 | 5.4 / 5.7 | 7.1 / 5.3 | 0.369 / 1.446 |
| events (40,000) | 11.8 / 3.6 | 10.8 / 4.6 | 14.7 / 14.8 | 0.336 / 1.914 |
| small (1,000) | 0.6 / 0.1 | 0.5 / 0.1 | 0.5 / 0.4 | 0.007 / 0.048 |
| irregular (4,000) | 1.2 / 0.9 | 1.2 / 1 | 1.7 / 2.2 | 0.031 / 0.045 |

**ungoogled Chromium 155.0.8059.39-1**

| data set (items) | this module 1.1.0 fast: pack / unpack, ms | this module 1.0.0 fast: pack / unpack, ms | msgpackr with records: pack / unpack, ms | size, MB: this module 1.1.0 / msgpackr |
|---|---|---|---|---|
| nfm-links (60,000) | 17.9 / 6.5 | 19.1 / 5.2 | 20.1 / 8.3 | 1.553 / 3.822 |
| nfm-nodes (20,000) | 10.9 / 3.1 | 11.5 / 3.4 | 10.6 / 5.8 | 0.437 / 1.697 |
| api-users (10,000) | 8.2 / 3.1 | 6.9 / 2.6 | 6.4 / 6.6 | 0.155 / 1.142 |
| geojson (4,000) | 7.1 / 4.2 | 6 / 4 | 5.7 / 2.9 | 0.369 / 1.446 |
| events (40,000) | 14.8 / 2.7 | 12.8 / 3.7 | 12.2 / 12.3 | 0.336 / 1.914 |
| small (1,000) | 0.5 / 0.1 | 0.5 / 0.1 | 0.6 / 0.1 | 0.007 / 0.048 |
| irregular (4,000) | 1.2 / 0.8 | 1.2 / 0.7 | 0.8 / 0.8 | 0.031 / 0.045 |

**WebKitGTK 2.52.6**

| data set (items) | this module 1.1.0 fast: pack / unpack, ms | this module 1.0.0 fast: pack / unpack, ms | msgpackr with records: pack / unpack, ms | size, MB: this module 1.1.0 / msgpackr |
|---|---|---|---|---|
| nfm-links (60,000) | 25 / 7 | 24 / 7 | 25 / 9 | 1.553 / 3.822 |
| nfm-nodes (20,000) | 13 / 6 | 14 / 5 | 12 / 9 | 0.437 / 1.697 |
| api-users (10,000) | 11 / 6 | 8 / 4 | 6 / 10 | 0.155 / 1.142 |
| geojson (4,000) | 10 / 9 | 9 / 7 | 6 / 3 | 0.369 / 1.446 |
| events (40,000) | 17 / 4 | 16 / 5 | 11 / 16 | 0.336 / 1.914 |
| small (1,000) | 0.8 / 0.3 | 0.7 / 0.3 | 0.3 / 0.3 | 0.007 / 0.048 |
| irregular (4,000) | 1 / 1 | 1 / 1 | 1 / 2 | 0.031 / 0.045 |

**GNOME Web (Epiphany) 46.5**

| data set (items) | this module 1.1.0 fast: pack / unpack, ms | this module 1.0.0 fast: pack / unpack, ms | msgpackr with records: pack / unpack, ms | size, MB: this module 1.1.0 / msgpackr |
|---|---|---|---|---|
| nfm-links (60,000) | 20 / 8 | 19 / 7 | 25 / 9 | 1.553 / 3.822 |
| nfm-nodes (20,000) | 14 / 6 | 14 / 5 | 12 / 9 | 0.437 / 1.697 |
| api-users (10,000) | 12 / 6 | 7 / 4 | 5 / 10 | 0.155 / 1.142 |
| geojson (4,000) | 7 / 7 | 7 / 7 | 6 / 4 | 0.369 / 1.446 |
| events (40,000) | 18 / 4 | 16 / 5 | 10 / 15 | 0.336 / 1.914 |
| small (1,000) | 0.8 / 0.3 | 0.7 / 0.3 | 0.3 / 0.3 | 0.007 / 0.048 |
| irregular (4,000) | 1 / 1 | 1 / 1 | 1 / 1 | 0.031 / 0.045 |

What the browser tables say: the packed size is the same in every browser and is 1.5 to 7.4 times smaller than msgpackr's. Against msgpackr with records, unpacking is faster or tied on all 7 sets in Firefox and on 6 of 7 in each of the other three browsers (the map features are 1.5 to 3 times slower there). Packing is equal or faster on 6 of 7 sets in Firefox; in Chromium it is 1.2 to 1.5 times slower on the text-heavy and nested sets; in both WebKit browsers it is 1.5 to 2.4 times slower on the user records, log events and map features (users 11 against 6 ms, events 17 against 11 ms in WebKitGTK). WebKit is this module's weakest engine.

**Does 1.1.0 pack slower than 1.0.0 in a browser?** Only on text-heavy data, and only because of text patterns. Pack time, milliseconds, smaller is better (best of 30 alternating runs, fast mode; the WebKit timer counts whole milliseconds):

| browser | data set | 1.0.0 | 1.1.0 | 1.1.0 with `patterns: false` |
|---|---|---:|---:|---:|
| Firefox 158.0 | users (10,000) | 8.6 | 9.2 | 8.5 |
| Firefox 158.0 | events (40,000) | 11.8 | 16.1 | 13.4 |
| Firefox 158.0 | links (60,000) | 20.9 | 19.6 | 19.1 |
| ungoogled Chromium 155.0.8059.39-1 | users (10,000) | 7.3 | 8.4 | 7.2 |
| ungoogled Chromium 155.0.8059.39-1 | events (40,000) | 14.2 | 15.1 | 14.1 |
| ungoogled Chromium 155.0.8059.39-1 | links (60,000) | 19.1 | 17.4 | 17.4 |
| GNOME Web 46.5 | users (10,000) | 8 | 11 | 8 |
| GNOME Web 46.5 | events (40,000) | 15 | 17 | 14 |
| GNOME Web 46.5 | links (60,000) | 25 | 23 | 23 |
| WebKitGTK 2.52.6 | users (10,000) | 8 | 11 | 8 |
| WebKitGTK 2.52.6 | events (40,000) | 16 | 18 | 15 |
| WebKitGTK 2.52.6 | links (60,000) | 24 | 23 | 23 |

Takeaway: on text-heavy data 1.1.0 costs about 1 to 4 ms more per pack at these sizes and gives a 29 to 33% smaller file; on number-heavy data (links) it is the same speed or slightly faster. `patterns: false` brings the 1.0.0 speed back everywhere.

#### What keeping it costs in memory (Node, after a full garbage collection)

> **Node numbers.** The speeds in this section were measured in Node, not in the four test browsers (ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5), so they are not what a visitor's browser does. Use them to compare rows with each other, not as page speeds. Memory figures are Node's heap, not a browser's. Re-measuring in the four browsers is not done (open item on `TASKS.md`).

Megabytes held in memory (smaller is better); the last two columns say how many times smaller than the live objects (bigger is better).

| set | live objects | packed fast | packed small | view() open | JSON text | objects / packed fast | objects / view |
|---|---:|---:|---:|---:|---:|---:|---:|
| nfm-links (300000) | 116.4 MB | 7.5 MB | 6.4 MB | 7.5 MB | 54.6 MB | 16x | 15.5x |
| nfm-nodes (100000) | 55.8 MB | 2.0 MB | 1.8 MB | 2.0 MB | 21.2 MB | 28x | 27.6x |
| api-users (50000) | 29.9 MB | 0.7 MB | 0.6 MB | 0.7 MB | 10.5 MB | 41x | 40.6x |
| events (200000) | 45.4 MB | 1.6 MB | 1.2 MB | 1.6 MB | 19.3 MB | 28x | 28.4x |

"live objects" is what the plain objects take in the JavaScript heap. Packed, the same data takes 16 to 41 times less (fast mode). An open `view()` keeps the packed bytes and restores a column only when it is read, so it starts at the packed size (1.0.0 restored everything up front and held 1.7 to 4.6 times less than the objects; 1.1.0 holds 15 to 41 times less until columns are read).

view() reads on nfm-nodes (100,000 items), best of 7:
- open view (reads the control stream once): 0.02 ms
- 1,000 random get(i) after open: 0.39 ms (0.39 microseconds each, objects built on the spot)
- 1,000 random field(i, "x"): 0.09 ms
- column("x") as Float32/64Array: 0.00 ms
- full unpack for comparison: 45.7 ms

Reading one column of the 300,000 links takes about 1.4 ms the first time; the first 1,000 `get(i)` calls restore every column (about 16 ms); `release()` frees them again.

### How it compares

Much smaller than every other way I measured to keep objects (2.4 to 7.2 times smaller than avsc; 2.5 times smaller than msgpackr), and in all four browsers its unpack is faster or tied with msgpackr with records on most test sets, but the code to ship is much bigger, and on text-heavy data it can pack slower. The speed column was re-measured on version 2.0.1 (checked 2026-10-18, best of 12 runs, one browser at a time, order Chromium 155 / Firefox 158.0 / WebKitGTK 2.52.6 / GNOME Web 46.5; WebKitGTK and GNOME Web round timers to whole milliseconds); the sizes are from earlier versions of the same modes. Size: smaller is better; milliseconds: smaller is better.

| Alternative | Code to ship, gzipped (smaller is better) | Size of 300,000 links (smaller is better) | Speed on 60,000 links, pack and unpack in ms (Chromium / Firefox / WebKitGTK / GNOME Web, smaller is better) | Features | Where it wins or loses |
|---|---|---|---|---|---|
| memory-compression-jso (MIT, this module) | 271 KB, about 84 KB gzipped (2.0.1, not minified, the current file) | 7.854 MB fast, 6.716 MB small | Fast: 15.2 and 7.1 / 14.4 and 8.5 / 22 and 6 / 19 and 5. Small: 208 and 26.8 / 141.7 and 17.6 / 134 and 22 / 115 and 21 | No schema; exact `undefined`, `-0`, `Map`, `Set`, `BigInt`, shared objects with `refs: true`; `view()` | Wins on size and exactness; loses on download size |
| msgpackr 2.1.0 (MIT), with records | 30 KB, 11 KB gzipped, minified | 20.005 MB | 18.7 and 8.2 / 22.0 and 12.6 / 19 and 8 / 24 and 9 | Streaming; misses `-0`, `Set` and more | Wins on code size and on packing text-heavy data |
| avsc 5.7.9 (Avro for JavaScript, MIT) | 117 KB, 34 KB gzipped, minified browser bundle | 18.767 MB | 38.1 and 31.2 / 59.6 and 94.0 / 67 and 83 / 54 and 67 | Needs a schema; streaming; works across languages | Wins on schema evolution and cross-language use; slower in all three browsers measured |
| cbor-x 1.6.6 (MIT), with records | 31 KB, 11 KB gzipped, minified | 20.905 MB | 25.6 and 7.5 / 29.7 and 12.7 / 13 and 10 / 18 and 10 | Streaming; keeps more types than msgpackr | Wins on code size |
| `JSON.stringify` and `JSON.parse` (built in) | 0 | 57.258 MB (as text) | 73.5 and 38.3 / 69.6 and 52.3 / 52 and 33 / 56 and 40 | Changes `undefined`, `-0`, `Set`, `Map`, shared objects | Wins on needing nothing |
| Node's `v8.serialize` | 0 | 40.659 MB | Node only, so no browser number | Keeps nearly every type; Node only | Not usable in a browser |

Where it loses:
- A much bigger file to ship than msgpackr, cbor-x or @msgpack/msgpack.
- On objects with many short text fields (the users set) it packs slower than msgpackr with records, up to 2.4 times slower in WebKit (kept from the notes below).
- Not a streaming format, and class instances come back as plain objects.
- avsc with a schema packs faster than this module on some large sets (see "What it is not" below). Speed of cbor-x, JSON and Flechette in browsers: not shown in this README.

#### The full comparison
Measured against msgpackr 2.1.0 (with and without records, and with bundled strings), cbor-x 1.6.6, @msgpack/msgpack 3.1.3, notepack.io 3.0.1, avsc 5.7.9 (Avro), Node's `v8.serialize`, bson 7.3.3, Apache Arrow through @uwdata/flechette 2.7.0, zipson 0.2.12, compress-json 3.4.0, lz-string 1.5.0, jsonpack 2.0.0, and JSON text through fflate 0.8.3 and lz4js 0.2.0. In the browsers the pure-JavaScript ones: msgpackr, cbor-x, @msgpack/msgpack, avsc, lz4js and JSON.

#### Which values come back exactly (Node; each value is packed inside `{ v: value }`, default settings unless the column says otherwise)
| value | jso-fast | JSON | msgpackr | msgpackr-records | cbor-x | cbor-x-records | @msgpack/msgpack | notepack.io | v8.serialize | bson | msgpackr (structuredClone on) | cbor-x (structuredClone on) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| undefined value | exact | changed | exact | exact | exact | exact | changed | changed | exact | changed | exact | exact |
| NaN | exact | changed | exact | exact | exact | exact | exact | exact | exact | exact | exact | exact |
| -0 | exact | changed | changed | changed | changed | changed | changed | changed | exact | exact | changed | changed |
| Infinity | exact | changed | exact | exact | exact | exact | exact | exact | exact | exact | exact | exact |
| BigInt | exact | throws | exact | exact | exact | exact | throws | throws | exact | changed | exact | exact |
| Date | exact | changed | exact | exact | exact | exact | exact | exact | exact | exact | exact | exact |
| invalid Date | exact | changed | exact | exact | exact | exact | changed | changed | exact | changed | exact | exact |
| Map | exact | changed | changed | exact | exact | exact | changed | changed | exact | throws | changed | exact |
| Set | exact | changed | changed | changed | exact | exact | changed | changed | exact | changed | exact | exact |
| RegExp | exact | changed | changed | changed | exact | exact | changed | changed | exact | exact | exact | exact |
| Float32Array | exact | changed | changed | changed | exact | exact | changed | changed | exact | changed | exact | exact |
| ArrayBuffer | exact | changed | changed | changed | changed | changed | changed | changed | exact | changed | exact | changed |
| sparse array | exact | changed | exact | exact | exact | exact | changed | changed | exact | changed | exact | exact |
| own "__proto__" key | exact | exact | changed | changed | changed | changed | throws | changed | exact | exact | changed | changed |
| lone surrogate in text | exact | exact | changed | changed | changed | changed | exact | changed | exact | changed | changed | changed |
| whole number above 2^53 | exact | exact | exact | exact | exact | exact | exact | changed | exact | exact | exact | exact |
| class instance | plain object | plain object | plain object | plain object | plain object | plain object | plain object | plain object | plain object | plain object | plain object | plain object |
| null-prototype object | exact | changed | changed | changed | changed | changed | changed | changed | changed | changed | changed | changed |
| same object twice (stays one object) | exact (refs: true) | two copies | two copies | two copies | two copies | two copies | two copies | two copies | exact | two copies | exact | exact |
| object that contains itself | exact (refs: true) | throws | throws | throws | throws | throws | throws | throws | exact | throws | throws | exact |

"changed" means the value came back different (for example `-0` as `0`, a `Set` as an array or a plain object, `undefined` as `null`); "two copies" means the same object came out as two equal objects; "plain object" means a class instance came back as an object without its class (every library here does that). msgpackr and cbor-x have an optional `structuredClone` setting; the last two columns show what it fixes. This module returned all 18 plain-data values exactly (shared objects and cycles need `refs: true`); the closest other is `v8.serialize`, which misses only null-prototype objects but works in Node only and is 69 to 119% of the JSON text. avsc and Flechette are left out of this table because they need a schema or flat columns; with the schema inferred from the data, avsc also stored decimals as 32-bit floats until they were widened to doubles for the speed tables.

#### Features
| | memory-compression objects 1.4.1 | msgpackr 2.1.0 | cbor-x 1.6.6 | @msgpack/msgpack 3.1.3 | avsc 5.7.9 | v8.serialize | Flechette 2.7.0 | JSON |
|---|---|---|---|---|---|---|---|---|
| License | MIT | MIT | MIT | ISC | MIT | built into Node | BSD-3-Clause | built in |
| Needs a schema | no | no | no | no | **yes** (inferred in these tests; hand-written is faster) | no | no, but flat columns only | no |
| Works in browsers | yes | yes | yes | yes | yes (needs a bundler) | **no** (Node only) | yes | yes |
| Size to ship (gzipped) | 272 KB (about 84 KB), not minified, WebAssembly text included | 30 KB (11 KB), minified | 31 KB (11 KB), minified | 22 KB (6 KB), minified | 117 KB (34 KB), minified browser bundle | 0 | 49 KB (16 KB), minified | 0 |
| Pack and unpack are synchronous | yes | yes | yes | yes | yes | yes | yes | yes |
| Streaming | no | yes | yes | yes | yes | no | not measured | no |
| Floats-aware (decimals as whole numbers, byte shuffle, column difference) | **yes** | no | no | no | no | no | no | no |
| Keep packed, read one item or one column | **yes** (`view()`) | no | no | no | no | no | yes (Arrow tables) | no |
| Nested objects, mixed arrays, `Map`, `Set`, `Date`, `BigInt`, `undefined`, `-0` | **yes** | partly (see the table above) | partly | partly | needs a schema (not run through the table above) | yes, all but null-prototype objects | flat columns (not run through the table above) | no |
| Safe on hostile input (limits, bounds) | **yes** (`maxItems`, `maxSize`, every size checked, fuzzed) | not measured | not measured | not measured | not measured | not measured | not measured | n/a |
| Cycles and shared objects | with `refs: true` | no | no | no | no | yes | no | no |
| Works without WebAssembly | yes (same bytes; 1.0 to 1.4 times slower to pack and 1.0 to 1.25 times to unpack in Node) | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

**Inside JS-modules:** [memory-compression](#part-1-bytes-and-typed-arrays) packs typed arrays and bytes (no objects); this module is the same core plus an object layer. `save-kit` and `zip-open` use the browser's own `CompressionStream` (asynchronous, no floats help).

### What it is not
- **Not the fastest packer for every shape of data.** On objects with many short text fields (the users set) it packs 1.2 times slower than msgpackr with records in Node and up to 2.4 times slower in WebKit, and avsc with a schema packs faster on the big sets. It wins on size, on unpack speed in most cases, and on number-heavy data.
- **Not good at irregular data.** When every item is different the size gain falls to about 37% of the JSON text and speed is about even with msgpackr, which is the bottom of what it does.
- **Not a streaming format.** It packs a whole value at once and needs the whole result to unpack.
- **Not a way to keep a live scene.** Unpacking 300,000 links takes about 70 ms in Node. Use it for data that sits still (other scenes, undo steps, saves, big tables, a copy kept while the objects are freed), then unpack it when you need it, or use `view()` to read single items.
- **Class instances come back as plain objects**, shared objects come back as copies unless `refs: true`, sparse array holes come back as `undefined`, and 64-bit typed arrays and `DataView` are refused with a clear error.

### API
`pack(value, opts)` returns a `Uint8Array`.
| Option | Meaning | Default |
|---|---|---|
| `mode` | `'fast'` (LZ4-class), `'balanced'` (fast core plus the number chooser) or `'small'` (chooser plus deflate, smallest, slowest to pack) | `'fast'` |
| `picker` | `true` turns the number chooser on in `fast` mode; `false` turns it off in `balanced` or `small` | per mode |
| `level` | deflate effort 0 to 9 in small mode | 4 |
| `refs` | `true` keeps shared objects shared and allows cycles (lists of objects are still stored by column) | off |
| `check` | `true` adds a checksum that `unpack()` verifies | off |
| `front` | `false` turns off front coding of sorted text columns (kept only when 15% or more smaller; those columns pack 1.3 to 1.8 times and read 1.2 to 2.2 times slower) | on |
| `fsst` | `true` also tries FSST codes for text columns (smaller, any one string readable alone; slower to pack) | off |
| `patterns` | `false` skips the text-pattern step (bigger result, faster to pack text-heavy data) | on |
| `float32` | `true` keeps columns of fractions in 4 bytes per value (lossy: relative error at most about 6e-8; values beyond 3e38 stay 8 bytes) | off |
| `pool` | `false` does not reuse number-column arrays between packs (they are otherwise kept for the next pack, at most 48 MB; `freeBuffers()` empties them) | on |
| `wasm` | `false` forces plain JavaScript | use WebAssembly if available |
| `report` | an array that is filled with what each part took (path, bytes before and after, milliseconds) | none |

`unpack(bytes, opts)` returns the value. `opts.maxItems` (default 100,000,000) is the most values it will make and `opts.maxSize` (default 1 GiB) the biggest column it will allocate; both stop a hostile or damaged input before it can use all memory. `opts.wasm` as above.

Also `keeper(opts)`, `profile(value, opts, repeats)`, `estimateBytes(value)` and `heap()`: see Keeping data packed under memory pressure above.

`view(bytes, opts)` for a packed array of 16 or more objects that all have the same keys returns `{ length, keys, lazy, get(i), field(i, key), column(key), slice(from, to), toArray(), loaded(), release(), memory() }`. A file made by 1.1.0 opens without restoring anything (`lazy` is true) and restores a column on first read; a file made by 1.0.0 is restored at open, as before. An array of fewer than 16 objects (stored in the general form) also opens (2.0.2): the same calls, `lazy` is false, the list is restored whole because it is small, and `release()` does nothing. Anything that is not an array of plain objects is refused.

Also: `freeBuffers()` (gives back the arrays kept between packs), `ready()` (a promise), `accelerated()` (is the WebAssembly helper in use), and `core` (the memory-compression module inside, for typed arrays and bytes). Errors are `Error` objects whose message starts with `MemoryCompressionJSO:` and say what is wrong in plain words.

### Good to know
- **Exact.** `pack` then `unpack` gives a value that is equal in every way the tests check (see the table of values above); the same bytes come out with and without WebAssembly (checked).
- **Same keys, same order.** Own enumerable string keys are kept in their original order. Symbol keys and non-enumerable properties are not stored.
- **Hostile input is safe to read.** Every count and size is checked against what is possible, damaged or cut-off data throws, and a flipped byte either throws or (without `check: true`) changes a value. The test file cuts data at every length and flips every byte.
- **`new Function` is used for speed.** The module does not even try it (so the page logs no blocked-eval error) when the page sets `MEMORY_COMPRESSION_NO_EVAL = true` before the file loads, or has a `<meta>` Content-Security-Policy whose `script-src` (else `default-src`) lacks `'unsafe-eval'`; a policy sent as an HTTP header cannot be read from a page, so use the switch there (2.0.2; before it, a page allowing only `'wasm-unsafe-eval'` logged one blocked-eval error per load in all four browsers). Where a page policy blocks it (tested in Node with `--disallow-code-generation-from-strings`), plain loops do the same work and the bytes are identical, but packing is 1.1 to 1.3 times slower and unpacking 1.2 to 3.3 times slower.
- **Very large inputs.** `maxItems` stops an unpack that would make more than 100 million values (change it if the data is yours).
- **Format 5 (1.4.0).** A file with a chooser-coded number column or text-dictionary codes says format 5; 1.3.x refuses it with "made by a newer version". Files made in `fast` mode with default settings keep saying 2, 3 or 4 and still open in older versions. 1.4.0 reads formats 1 to 5. A file that used the optional extra coder of 1.2.0 or 1.3.0 is refused with a plain message; read it with 1.3.0.
- **Format 4 (1.3.0).** A file that holds a front-coded text column says format 4 and 1.2.x refuses it with "made by a newer version"; use `front: false` to keep files readable by 1.2.x. 1.3.0 reads formats 1 to 4.
- **Format 3 (1.2.0).** A file that holds a date column, or an FSST text column says format 3 and 1.1.x refuses it with the message "made by a newer version"; every other file still says format 2 and opens in 1.1.x. 1.2.0 reads formats 1, 2 and 3.
- **Format.** The first two bytes are `MJ`, then a version byte; a file written by 1.0.0 is read by 1.1.0 (checked with a stored 1.0.0 file), but a 1.1.0 file is format 2 and 1.0.0 cannot read it. It is not compatible with `memory-compression`'s container (different magic).

### Prior art and credits
No code from others; the ideas and methods below are theirs, and the format and code are this repository's own (LFC Foundry, MIT). Nothing from the libraries named here ships inside the file.
- **msgpackr and cbor-x** (MIT): the record extension idea (repeated object layouts written once, generated decoders). Idea only.
- **avsc** (Avro for JavaScript, MIT): schema-compiled code. Idea only; used as a comparison.
- **Apache Arrow and Flechette** (BSD-3-Clause for Flechette): columnar tables. Idea only.
- **ALP** (SIGMOD 2024): decimal doubles stored as scaled whole numbers; used here in a simple form; idea only, no code taken.
- **FSST** (Boncz, Neumann and Leis, VLDB 2020): the opt-in `fsst` option, written from the paper, with its own 3 KB WebAssembly kernel and a JavaScript port; no code taken from the authors.
- **CLP, Denum and LogPrism** (log compression: text patterns plus number columns): what 1.1.0's text patterns do in a simple form. Idea only.
- **BtrBlocks and Vortex**: pick an encoding per column from a sample; cascading encodings. Idea only.
- **Blosc** (byte shuffle, through memory-compression, which has its own credits): idea only.

### For AI agents
- Use `pack`/`unpack` for a big array of similar objects you want to keep small in memory or save; `view()` to read single items from a packed array; `mode: 'small'` for anything restored rarely.
- Use `{ refs: true }` for a graph where links hold the node objects; `view()` for reading a little from a lot. Do not use it for tiny values (under about 16 items it is the general form and not much smaller than JSON), for streaming, or for data with class instances you need back as classes.
- Await `MemoryCompressionJSO.ready()` once at start-up. Check `packed.length`; irregular data gives up only about 60%.
- Sorted text (words, file paths) is front coded by itself (`front`, about 30 to 40% smaller, slower to read); pass `{ front: false }` for the fastest read or to keep files readable by 1.2.x.
- `{ fsst: true }` for big columns of names, paths or log lines (about half the size, one string readable alone, 2 to 6 times slower to pack); skip it for patterns and repeating values, which already have a smaller way (it chooses by itself).
- Number-heavy data that is packed once and kept (sensor logs, prices, coordinates, a parked layout): `mode: 'balanced'` (15 to 28% smaller on objects, up to 92% on a column; packing 2 to 7 times slower). For memory pressure: `keeper({ budget })` with `hold`, `restore`, `pin`, `trim`; read `memory()` for sizes and restore times.
- To re-run the comparison: `bench/README.md`.
