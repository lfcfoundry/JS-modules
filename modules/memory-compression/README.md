# memory-compression

**Version 2.3.4 · API 2**

**Tested in:** pager build of 60,000 links, balanced, 9 turns alternating: Chromium 155.0.8059.39 181 to 147 ms, Firefox 158.0 97 to 81, WebKitGTK 2.52.6 128 to 101, GNOME Web 46.5 121 to 98; fast mode level or faster; round trip equal; 51 of 51 checks

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

Lists of objects: `view()` opens a packed list without making any objects, `keeper()` holds named values under a memory budget, and `pager()` keeps a long list packed in pages that open, leave memory and spill to browser storage as needed.

```js
var packed = MemoryCompression.pack(links, { mode: 'balanced' });  // links: 300,000 objects with the same keys
var v = MemoryCompression.view(packed);                            // opens in well under 1 ms
v.get(4711);  v.field(4711, 'weight');  v.column('x1');            // one object, one value, one column
var K = MemoryCompression.keeper({ budget: 600e6 });               // restores in slices; the page stays free
K.hold('layout', layout);  K.restore('layout').then(function (layout) { /* ... */ });
```

```js
var P = MemoryCompression.pager(links, { pageRows: 2048, livePages: 4 });  // keeps the list packed in pages; your own array can be let go
P.get(4711);                       // one object, 0.4 to 3 ms the first time (only its page opens), then under a microsecond
P.range(1000, 1500);               // a run of rows
P.set(4711, links2);  P.changed(4711);   // after you change a row; its page is packed again when it leaves memory
P.pressure(1);                     // memory is tight: half the open pages go;  P.pressure(2): all go;  P.pressure(0): normal
P.spill({ all: true }).then(function () { /* packed bytes are in browser storage, none in memory */ });  // needs { spill: true }
MemoryCompression.pager(links, { background: true }).ready.then(function (P) { /* packed, a few milliseconds at a time */ });
MemoryCompression.pager(links, { pageRows: 'auto', livePages: 'auto', mode: 'auto' });  // page size, open pages and mode chosen from the rows and the device's memory
var plan = MemoryCompression.pager.plan(links);  // { pageRows, livePages, mode, why }: the choice, with the reason in words
```

`pager(list, opts)` is for long lists of objects you read a few at a time (a map, a log, a table). The list is packed in pages of `pageRows` rows (default 2,048; a page opens in time proportional to its rows, about 0.1 to 0.5 microseconds per row, so 2,048 rows take about 0.3 to 0.9 ms). At most `livePages` (default 4) pages are open at once; the least recently used one leaves memory when another opens, and a page that was only read leaves for free because its packed copy stays. Rows read in order open the next page in the background (`readAhead`, default on). `get(i)`, `range(from, to)`, `each(fn)` (a promise, one page at a time with the page free in between), `set`, `changed`, `push`, `flush()`, `settle()` (a promise: packs edited pages a few milliseconds at a time), `trim(n)`, `release()`, `pressure(level)`, `memory()`. `background: true` makes the pager at once and packs its pages a slice at a time (`ready` is a promise of the pager; reads work meanwhile); `sliceMs` sets the slice (default 8). With `auto` on (default) the pager steps the open pages down by itself when the page's heap gets close to its limit (Chromium-based browsers only; elsewhere call `pressure()` from your own signal); `onPressure(level, memory)` is called when that changes. `spill: true` (browser storage, IndexedDB) or `spill: { put, get, remove }` (your own store; each returns a promise) lets cold pages leave memory altogether: `spill()` (a promise) writes every closed, unedited page to the store and drops its packed bytes (`spill({ all: true })` closes the open pages first; a page that came back unchanged is not written again), `pressure(2)` does it by itself, `await load(i)` or `await getAsync(i)` brings a page back (the next page is fetched ahead when rows are read in order), `each()` reads spilled pages straight from the store, and `dispose()` empties the store. Plain `get(i)` on a spilled page throws a message that says to load it first. Objects handed out by `get()` belong to their page: after the page leaves memory and comes back they are new objects, so call `changed(i)` or `set(i, value)` for a row you changed, and do not keep objects that point at each other across pages. Every other option is a pack option used for each page. **Choosing for you (since 2.3.0).** `pageRows: 'auto'`, `livePages: 'auto'` and `mode: 'auto'` (or `MemoryCompression.pager.plan(list, { deviceMemory })`, which returns `{ pageRows, livePages, mode, why }`) look at 64 sample rows and `navigator.deviceMemory` (else the option). A page is sized to about 512 KB of live objects on 4 GB or more (256 KB at 2 to 3 GB, 128 KB below 2 GB), between 512 and 2,048 rows (never longer than the fixed default, since 2.3.1), so a page opens in about the same time whatever the rows hold, and thin rows keep the 2,048-row default; the open pages get about 2 MB (1 MB, 512 KB), between 2 and 8 pages. The mode stays fast unless the packed list alone would take more than a tenth of the page's memory, then it is balanced (15 to 17% smaller packed, but pages open 1.3 to 2.2 times slower and build 1 to 5 times slower). Packed bytes stay within 1 to 3% of the default on big-memory devices. Page-open time, ms, lower is better, default 2,048 rows with 4 open / auto on an 8 GB device (numbers from the memory-compression research thread, median of 12 rounds of 20 reads): Links (3,072 rows) Chromium 155 0.72 / 0.68, Firefox 158.0 0.86 / 1.49, WebKitGTK 2.52.6 0.65 / 1.00, GNOME Web 46.5 0.70 / 0.90; Scene items (1,792 rows) 0.68 / 0.61, 0.93 / 0.71, 1.55 / 1.25, 1.85 / 2.15; User records (1,280 rows) 1.30 / 1.00, 1.41 / 1.01, 2.25 / 1.45, 2.50 / 1.55. Level or faster except Links in Firefox (3,072-row pages of thin rows) and Scene items in GNOME Web. On a 2 GB device it cuts page-open to 0.28 to 0.65 ms in Chromium and Firefox for 4 to 14% more packed bytes.

**Pager numbers** (pages of 2,048 rows, 4 pages open; ms, lower is better; ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5, one at a time). Opening a closed page, median / 90th percentile:

| Browser | Links (60,000) | Scene items (20,000) | User records (10,000) |
|---|---:|---:|---:|
| Chromium | 0.50 / 1.00 | 0.70 / 2.20 | 0.90 / 2.70 |
| Firefox | 0.42 / 0.50 | 0.86 / 1.00 | 1.34 / 1.94 |
| WebKitGTK | 2 / 2 | 2 / 3 | 3 / 6 |
| GNOME Web | 1 / 2 | 1 / 2 | 3 / 6 |

The first read of one row from the whole packed list (`view()`) is 6 to 50 ms; a row in an open page is under 1 microsecond. Packed bytes against packing the list whole: 2% more (Links), 4% more (Scene items), 5% more (User records). Packing 60,000 links into pages freezes the page for 50.6 / 61.2 / 70 / 72 ms all at once (Chromium / Firefox / WebKitGTK / GNOME Web) and 7.3 / 6.5 / 9 / 9 ms with `background: true`. Real JS heap in Chromium 155 for 60,000 links: 7.62 MB as live objects, 2.43 MB with the pager and nothing open, 3.46 MB with 4 pages open. Bringing a page back from browser storage (read plus unpack) takes 1.8 to 8 ms median for the three lists in the four browsers; writing all of Links' pages to storage takes 39 to 47 ms and takes the packed bytes in memory from 1.59 MB to 0.

Opening time grows in step with the rows in a page (Chromium, after warm-up: about 0.12 to 0.15 microseconds per row for Links, 0.23 to 0.29 for Scene items, 0.42 to 0.46 for User records, so a 4,096-row page opens in 0.5 / 1.0 / 1.7 ms) and does not jump at 4,096; the default stays 2,048 (about 0.3 to 0.9 ms a page). The automatic memory-pressure step needs `performance.memory` (Chromium-based browsers); elsewhere call `pressure()` from your own signal. Spilled pages are stored under a random id per pager; call `dispose()` when done.

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

Also on the object: `pager(list, opts)` with `get`, `getAsync`, `load`, `range`, `each`, `set`, `changed`, `push`, `flush`, `settle`, `spill`, `trim`, `release`, `pressure`, `memory`, `dispose`; `keeper(opts)` with `hold`, `get`, `restore`, `each`, `pin`, `unpin`, `trim`, `release`, `drop`, `memory`, `calibrate`; `estimateBytes(value)`, `profile(value, opts, repeats)`, `heap()`; `ready()` and `accelerated()`; the standard formats `lz4Compress`, `lz4Decompress`, `deflate`, `inflate`, `zlib`, `unzlib`, `gzip`, `gunzip`; and `shuffle`, `unshuffle`, `crc32`, `adler32`. The parts are `MemoryCompression.core`, `.objects` (also `.jso`, and the global `MemoryCompressionJSO`) and `.picker`. Errors are `Error` objects whose message starts with `MemoryCompression:` and says what is wrong in plain words. Every option with its default is listed in the full notes.

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

**The same 60,000 links kept in pages of 2,048 rows, one page opened at a time** (version 2.2.0, `pager()` against page-by-page copies made with each library; median of 5 turns, one browser at a time; times in ms, lower is better, each cell is Chromium 155 / Firefox 158.0 / WebKitGTK 2.52.6 / GNOME Web 46.5; "open" is the mean of 29 pages timed as one block; every contender gave back equal rows):

| Way of keeping the list | Bytes kept | Pack all rows | Open one page |
|---|---:|---|---|
| memory-compression `pager()`, fast | 439,494 | 28 / 40 / 55 / 51 | 0.43 / 0.45 / 0.66 / 0.62 |
| memory-compression `pager()`, small | 357,481 | 277 / 174 / 189 / 192 | 0.77 / 0.59 / 0.79 / 0.97 |
| msgpackr, records, per page | 2,136,891 | 18 / 19 / 15 / 16 | 0.33 / 0.72 / 0.66 / 0.62 |
| JSON text + fflate gzip level 1, per page | 1,154,475 | 141 / 154 / 150 / 159 | 2.38 / 1.83 / 4.38 / 4.17 |
| JSON text + lz4js, per page | 1,602,817 | 50 / 46 / 54 / 61 | 2.16 / 1.62 / 4.21 / 4.10 |
| JSON text, per page | 5,493,765 | 14 / 14 / 15 / 15 | 0.63 / 0.45 / 1.03 / 1.07 |
| JSON text, whole list in one piece | 5,493,736 | 17 / 21 / 16 / 17 | 19.97 / 17.90 / 31.48 / 29.55 |

The pager keeps 4.9 times fewer bytes than msgpackr with records and opens a page as fast (faster in Chromium for msgpackr, 0.33 against 0.43 ms; slower in Firefox, 0.72 against 0.45). It loses on packing all at once (1.6 to 3.7 times slower than msgpackr with records); `background: true` packs in slices of about 8 ms instead. Not measured: heap held by the open page, other data shapes, `bundleStrings`. Details and raw lines: `js-modules-research/memory-compression-jso/2.2.0/vs-competitors/`.

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

`node modules/memory-compression/test/core.js` (packing core, 24 checks), `test/run.js` (object layer, 50 checks) and `test/router.js` (the one entry point, 15 checks), a few seconds each; `--js-only` runs without WebAssembly and `FULL=1` adds 10 times more random cases. Browser checks: `bench/lazy-start.js`, `bench/csp-and-speed.js` and `bench/browser-run.js` (see `bench/README.md`). Rebuild the file with `python3 modules/memory-compression/build.py`; rebuild the helper with `sh wasm/build.sh && python3 wasm/embed.py` (clang with the wasm32 target); the JavaScript and WebAssembly paths must stay byte-identical, and the tests check that.

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
