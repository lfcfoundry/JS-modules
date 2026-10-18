# memory-compression

**Version 2.0.3 · API 2**

**Tested in:** ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5

Keeps big data packed in memory and brings it back exactly: bytes, typed arrays (floats, coordinates) and big lists of plain JavaScript objects. **One file, no dependencies, works offline: `memory-compression.js`** (274.3 KB readable, 84.6 KB gzipped).

`MemoryCompression.pack(anything)` picks the layer from what you pass. Bytes and typed arrays go through a packing core: it shuffles the bytes so similar parts sit together, takes the difference between neighbors in each column, then squeezes the result with an LZ4-class coder (fast mode) or deflate (small mode). Lists of records go through an object layer: records are stored by column, each column picks its cheapest form (repeated values, narrow whole numbers, decimals as scaled whole numbers, a dictionary for repeated text, text patterns, dates), and the number columns go through the packing core. `unpack` reads the first two bytes to see which layer wrote the data. Two small WebAssembly helpers are inside the file and optional: the plain JavaScript does the same work and writes the same bytes, only slower.

Forged by LFC Foundry. Copyright (c) 2026 LFC Foundry, MIT license.

## Why it exists

Big scenes, undo steps, save data and large tables take a lot of memory when kept as they are, and a general compressor treats floats and records as plain bytes. This module first rearranges the data so numbers pack better, and it gives everything back exactly. It is for data that sits still and is restored when needed, not for what is drawn this frame (restoring a 120 MB scene takes 140 to 250 ms).

## Install and use

No install step: copy `memory-compression.js` next to your page (`<script src="memory-compression.js"></script>` sets `MemoryCompression`) or `require` it in Node.

```js
var packed = MemoryCompression.pack(bigThing);     // a Uint8Array: typed array, bytes, or a list of objects
bigThing = null;                                   // free the original
var back = MemoryCompression.unpack(packed);       // the same values again, bit for bit
```

Typed arrays of records shrink more when you say how wide a row is, in bytes, and a packed array can be read a piece at a time:

```js
var nodes = new Float32Array(100000 * 16);                        // 64 bytes per record
var held = MemoryCompression.pack(nodes, { width: 64, chunk: 262144 });
var piece = MemoryCompression.view(held).read(3);                 // only piece 3, restored in about 1 ms
```

Lists of objects: `view()` opens a packed list without making any objects, and `keeper()` holds named values under a memory budget.

```js
var packed = MemoryCompression.pack(links, { mode: 'balanced' });  // links: 300,000 objects with the same keys
var v = MemoryCompression.view(packed);                            // opens in well under 1 ms
v.get(4711);  v.field(4711, 'weight');  v.column('x1');            // one object, one value, one column
var K = MemoryCompression.keeper({ budget: 600e6 });               // restores in slices; the page stays free
K.hold('layout', layout);  K.restore('layout').then(function (layout) { /* ... */ });
```

The WebAssembly helper starts the first time you pack or unpack (since 2.0.3), so a page that never packs does not pay for it. `accelerated()` is `false` until then; `await MemoryCompression.ready()` starts it early if you want the fast path from the very first call. Try it: `demo.html` (objects) and `demo-arrays.html` (arrays and bytes).

## Choosing a mode

| `mode` | Use it for | Packs | Cost |
|---|---|---|---|
| `'fast'` (default) | live memory: pack and restore often | LZ4-class coder | quickest |
| `'balanced'` | number-heavy data packed once and kept | fast core plus a per-block number chooser | objects 15 to 28% smaller than fast; packing 2 to 7 times slower and reading about the same (times from Node) |
| `'small'` | save files, undo history, scenes you will not touch for a while | number chooser plus deflate | smallest; slowest to pack |

## API

`pack(value, opts)` returns a `Uint8Array`. `unpack(bytes, opts)` returns the value (`as: 'bytes'` gives a `Uint8Array`; `into` fills a buffer you already have). `view(bytes, opts)` opens a packed typed array (`chunks`, `chunkLength(i)`, `read(i, into)`) or a packed array of objects (`length`, `keys`, `get(i)`, `field(i, key)`, `column(key)`, `slice(from, to)`, `toArray()`, `loaded()`, `release()`, `memory()`). A list of fewer than 16 objects is restored whole.

| Option | Meaning | Default |
|---|---|---|
| `mode` | `'fast'`, `'balanced'` or `'small'` | `'fast'` |
| `layer` | `'core'` (bytes and typed arrays only) or `'objects'` (everything) | by what you pass |
| `width` | bytes per record: 1 to 255, or `'auto'` | element size |
| `chunk` | bytes per piece for typed arrays | 1048576 |
| `level` | deflate effort 0 to 9 in small mode | 4 |
| `refs` | `true` keeps shared objects shared and allows cycles | off |
| `check` | `true` adds a checksum that `unpack()` verifies | off |
| `fsst` / `front` / `patterns` | FSST codes for text (opt-in); front coding of sorted text; text patterns (the last two on by default) | see notes |
| `float32` | `true` keeps fraction columns in 4 bytes (lossy, relative error at most about 6e-8) | off |
| `wasm` | `false` forces plain JavaScript | use WebAssembly if available |
| `maxSize`, `maxItems` | limits that stop a hostile or damaged input (1 GiB, 100,000,000) | as shown |

Also on the object: `keeper(opts)` with `hold`, `get`, `restore`, `each`, `pin`, `unpin`, `trim`, `release`, `drop`, `memory`, `calibrate`; `estimateBytes(value)`, `profile(value, opts, repeats)`, `heap()`; `ready()` and `accelerated()`; the standard formats `lz4Compress`, `lz4Decompress`, `deflate`, `inflate`, `zlib`, `unzlib`, `gzip`, `gunzip`; and `shuffle`, `unshuffle`, `crc32`, `adler32`. The parts are `MemoryCompression.core`, `.objects` (also `.jso`, and the global `MemoryCompressionJSO`) and `.picker`. Errors are `Error` objects whose message starts with `MemoryCompression:` and says what is wrong in plain words. Every option with its default is listed in the full notes.

## Numbers and how it compares

Size is smaller-is-better and times are lower-is-better in every table. Every result was restored and compared with the original.

**Lists of objects** (300,000 network links for the size; 60,000 links for the time, pack and unpack in ms, version 2.0.1, best of 12 runs, one browser at a time; WebKitGTK and GNOME Web round to whole milliseconds):

| Library | Size of 300,000 links | Chromium 155 | Firefox 158.0 | WebKitGTK 2.52.6 | GNOME Web 46.5 |
|---|---|---|---|---|---|
| memory-compression, fast | 7.854 MB | 15.2 and 7.1 | 14.4 and 8.5 | 22 and 6 | 19 and 5 |
| memory-compression, small | 6.716 MB | 208 and 26.8 | 141.7 and 17.6 | 134 and 22 | 115 and 21 |
| msgpackr 2.1.0, records | 20.005 MB | 18.7 and 8.2 | 22.0 and 12.6 | 19 and 8 | 24 and 9 |
| cbor-x 1.6.6, records | 20.905 MB | 25.6 and 7.5 | 29.7 and 12.7 | 13 and 10 | 18 and 10 |
| avsc 5.7.9 (needs a schema) | 18.767 MB | 38.1 and 31.2 | 59.6 and 94.0 | 67 and 83 | 54 and 67 |
| JSON text | 57.258 MB | 73.5 and 38.3 | 69.6 and 52.3 | 52 and 33 | 56 and 40 |

2.5 times smaller than msgpackr with records, and its unpack is as fast or faster in all four browsers; it loses on download size (about 84.6 KB gzipped against 11 KB for msgpackr) and on packing text-heavy records (up to 2.4 times slower than msgpackr in WebKit).

**A 120 MB scene of records, coordinates and text** (version 1.0.0 of the core, which fast mode still matches; Firefox 158, pack and restore in ms):

| Method | Size | Firefox 158.0 |
|---|---|---|
| memory-compression, fast | 52.1% | 375 and 239 |
| memory-compression, small | 41.3% | 3731 and 434 |
| lz4-wasm 0.9.2 | 73.6% | 849 and 312 |
| zstd-wasm 0.0.27, level 3 | 54.0% | 1563 and 626 |
| fflate 0.8.3, level 6 | 51.8% | 12979 and 1549 |

Fast mode restores faster than lz4-wasm in Firefox 158.0 and Chromium 155 but not in WebKitGTK 2.52.6 (123 ms against 221 ms), and it restores faster than zstd-wasm and fflate everywhere; it is the only one here that understands floats and records, so it is far smaller than plain LZ4. `mode: 'balanced'` on 100,000 numbers: ids 1,635 B to 121 B, timestamps 71,052 B to 20,548 B, prices 132,045 B to 97,214 B (sizes are identical in all four browsers). Restoring 300,000 links through `keeper().restore()` takes 81 to 138 ms with the longest page freeze 21 to 31 ms, against a 53 to 76 ms freeze for `get()`. The 2.0.3 change in numbers: a page that loads the module but never packs uses about 5.8 MB less (14.96 to 9.12 MB, Chromium 155); the first pack takes up to 10 ms longer.

## What it is not

- **Not a magic fix for noisy floats.** Coordinates with random low digits give up only 8 to 20%; colors, ids, flags, repeated values and smooth sequences give up 50 to 70% (more with `balanced`).
- **Not for what is drawn this frame**, and not a streaming format. It packs a whole value at once; there is no LZ4 frame format and no preset dictionary.
- **Not the fastest packer for every shape of data**, and class instances come back as plain objects.

## Good to know

- **Exact.** NaN payloads, -0, `undefined`, `Date`, `Map`, `Set`, `BigInt`, `RegExp`, sparse arrays and `__proto__` keys come back as they went in; shared objects and cycles with `refs: true`. 64-bit typed arrays and `DataView` inside objects are refused with a clear error.
- **Hostile input is safe to read.** Sizes are checked against what is possible, damaged or cut-off data throws, and results above `maxSize` or `maxItems` are refused. Without `check: true` a flipped byte either throws or changes a value.
- **Page policy.** A policy without `'wasm-unsafe-eval'` makes `accelerated()` return `false`; everything still works with the same bytes, 1.5 to 4 times slower. The object layer builds small functions with `new Function` for speed and does not even try it when the page sets `MEMORY_COMPRESSION_NO_EVAL = true` before the file loads or has a `<meta>` policy without `'unsafe-eval'` (a policy sent as an HTTP header cannot be read, so use the switch there); plain loops do the same work.
- **Formats.** Files from memory-compression 1.x and memory-compression-jso 1.x open unchanged. Until 2.0.0 this was two modules; `MemoryCompressionJSO` is kept as an alias for the object layer.

## Test it and rebuild it

`node modules/memory-compression/test/core.js` (packing core, 24 checks), `test/run.js` (object layer, 41 checks) and `test/router.js` (the one entry point, 15 checks), a few seconds each; `--js-only` runs without WebAssembly and `FULL=1` adds 10 times more random cases. Browser checks: `bench/lazy-start.js`, `bench/csp-and-speed.js` and `bench/browser-run.js` (see `bench/README.md`). Rebuild the file with `python3 modules/memory-compression/build.py`; rebuild the helper with `sh wasm/build.sh && python3 wasm/embed.py` (clang with the wasm32 target); the JavaScript and WebAssembly paths must stay byte-identical, and the tests check that.

## For AI agents

- `pack`/`unpack` for typed arrays and big arrays of similar objects you want to keep small or save; pass `width` equal to the record size in bytes for arrays of rows; `mode: 'small'` for anything restored rarely, `'fast'` for anything restored often, `'balanced'` for number-heavy data packed once.
- Keep many packed things and restore one at a time (`unpack(packed, { into: buffer })`, `view()`, `keeper()`). Use `{ refs: true }` for a graph where links hold node objects. Under about 16 items it is not much smaller than JSON.
- Never assume the data is smaller: check `packed.length`. Do not add a second compression library next to it; its `deflate`/`inflate`/`gzip`/`lz4Compress` replace fflate, pako and lz4js for what they do here.
- `await MemoryCompression.ready()` once at start-up only if you want the fast path from the first call.

## Prior art and credits

The JavaScript, the C source of the WebAssembly helpers and the format are this repository's own (LFC Foundry, MIT); no code was taken from the projects below, and nothing from them ships inside the file. fflate, pako, lz4js, lz4-wasm, @bokuweb/zstd-wasm, fzstd, msgpackr, cbor-x, avsc, Flechette and the browser's CompressionStream were run as comparisons only.

- **LZ4 block format**, by Yann Collet: read and written as the standard format. Format only.
- **deflate, zlib and gzip** (RFC 1951, 1950, 1952): written from scratch, tested against Node's zlib, fflate and pako.
- **Byte shuffle before compressing**: from Blosc (a C library). Idea only; Blosc was not measured.
- **msgpackr and cbor-x** (MIT): the record extension idea, repeated layouts written once with generated decoders. **avsc** (MIT): schema-compiled code. **Apache Arrow and Flechette** (BSD-3-Clause): columnar tables. Ideas only.
- **ALP** (SIGMOD 2024): decimals stored as scaled whole numbers, in a simple form. **FSST** (Boncz, Neumann and Leis, VLDB 2020): the opt-in `fsst` option, written from the paper. **CLP, Denum and LogPrism**: text patterns plus number columns. **BtrBlocks and Vortex**: pick an encoding per column from a sample. Ideas only.
- The column difference step is a common idea for numeric tables.

## Full research notes

The long version of this page (every table for every browser, the full list of libraries compared and which values each one brings back exactly, per-feature numbers for dates, front coding, FSST, the number chooser, the keeper and memory use, and the history of the format) is kept in the project's private knowledge base, along with the raw results. The changelog is `CHANGELOG.md` in this folder.
