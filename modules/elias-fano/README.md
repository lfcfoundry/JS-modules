# elias-fano

**Version 1.6.0 · API 1**

**Tested in:** Firefox 158, Chromium 155, WebKitGTK 2.52.6 (container)

Keeps sorted whole numbers (ids, positions, timestamps, links of a graph) in about a third to a half of the memory of a plain 32-bit array, and still answers "what is value number i" and "where is the first value at or above x" without unpacking. It also keeps many sorted lists in one structure (the links of every item of a map) and decodes them all at once, fast. **One file, no dependencies, works offline.** A WebAssembly path (with SIMD where the browser has it) is compiled the moment the file loads; plain JavaScript answers until it is ready and gives the same answers.

Part of [JS-modules](../../README.md). MIT License, Copyright (c) 2026 LFC Foundry.

## Why it exists
Sorted number lists are everywhere: which items a link touches, which rows match a word, where each record starts. As plain arrays they cost 4 bytes per number whatever the numbers are. Elias-Fano coding spends about 2 bits plus log2(range / count) bits per number and keeps the order, so lookups and "next value at or above x" stay fast. Netflow Map's 30,000 lists of 94,597 links shrink from 498 KB to 223 KB, and the LFC-pack file format uses the same coding for its id lists.

## Use

```html
<script src="elias-fano.js"></script>
<script>
  var bytes = EliasFano.build(new Uint32Array([3, 8, 8, 20, 400]));   // sorted (duplicates allowed), values up to 4,294,967,295
  var list = EliasFano.open(bytes);
  list.get(3);          // 20
  list.nextGEQ(9);      // 3  (index of the first value >= 9; list.length when none)
  list.nextValue(9);    // 20
  list.rank(8);         // 3  (how many values are <= 8; list.lowerBound(8) is how many are < 8)
  list.contains(8);     // true
  list.count(5, 100);   // how many values in [5, 100)
  list.slice(1, 4);     // Uint32Array [8, 8, 20]
  list.toArray();       // everything (fast: WebAssembly with SIMD when available)
  list.getMany(idx); list.nextGEQMany(xs); list.rankMany(xs);   // batches
  EliasFano.intersect([listA, listB, listC]);   // values present in every list, as a Uint32Array (nothing is unpacked): one call into WebAssembly
</script>
```

Many lists at once:

```js
var blob = EliasFano.buildLists([[1, 5], [], [2, 2, 9]]);   // each list sorted; arrays or Uint32Arrays
var set = EliasFano.openLists(blob);
set.get(2);        // Uint32Array [2, 2, 9]
set.size(0);       // 2
var all = set.decodeAll();   // { offsets: Uint32Array(n + 1), values: Uint32Array }: plain offset arrays, decoded in one pass
```

`build` and `buildLists` give a `Uint8Array` you can store or send; `open` and `openLists` read it back. Lists made in JavaScript and in WebAssembly are byte for byte the same. Call `free()` on a list you are done with when WebAssembly is in use (it copies the bytes into its own memory on first use).

That copy means two copies sit in memory while you read: the bytes you opened and the one inside WebAssembly. `list.compact()` (or `open(bytes, { compact: true })`, also for `openPartitioned` and `openLists`, after `await EliasFano.ready()`) lets go of the JavaScript copy, so memory in use halves: 1.69 MB instead of 3.38 MB for a list of 1,000,000 ids. Drop your own reference to the bytes too, or they stay in memory. Answers stay the same. Reading one list at a time from a compacted list set (`get(i)`) takes about 1.1 to 1.2 times as long; `getMany` and single values do not change. `getMany` refuses positions outside the list with a `RangeError` (before 1.6.0 such a position could hang the plain JavaScript reader).

`EliasFano.setBackend('js' | 'wasm' | 'auto')`, `EliasFano.accelerated()`, `EliasFano.simd()` and `EliasFano.ready()` tell and steer which path answers.

## How it compares
Same page, alternating rounds, Firefox 158 / Chromium 155 / WebKitGTK 2.52.6 (details and method in the repository's test `tests/elias-fano-speed-browser.js`):

| Job | Plain | Elias-Fano |
|---|---|---|
| Size of 94,597 links in 30,000 lists | 498 KB | 223 KB |
| Size of 1,000,000 sorted values | 4.0 MB | 1.34 MB |
| First value at or above x (20,000 lookups, 1,000,000 values) | binary search 4.0 / 3.3 / 3.6 ms | 1.6 / 1.4 / 1.4 ms in WebAssembly (2.3 to 3.0x faster) |
| Read all 94,597 links | plain arrays 1.3 / 1.2 / 0.6 ms | 1.9 / 2.0 / 1.5 ms (decode all, WebAssembly) |
| Value number i, 20,000 random reads | 0.05 to 0.1 ms | 1.0 to 3.2 ms (14 to 40x slower) |

It is for lists you search or scan, not for hammering single reads: keep a decoded copy (`toArray`, `decodeAll`) when you need those.

## Partitioned lists (since 1.2.0)
`buildPartitioned` cuts the list into chunks of 128 values (or 32, 64, 256, 512, 1024) and stores each chunk the cheapest way: as a plain run (no bits at all, when the numbers are consecutive), as a bitmap (when more than about a third of the numbers in its range are present) or as Elias-Fano. It wins where a list has dense stretches, such as the document ids of a common word, and costs about the same as the flat form elsewhere. It has the same questions as a single list (`get`, `nextGEQ`, `rank`, `contains`, `count`, `slice`, `toArray`, the batches, `free`) and one more, `stats()`, which says how many chunks took each form.

```js
var blob = EliasFano.buildPartitioned(sortedValues, { chunk: 256 });   // chunk: 32 .. 1024, default 128
var list = EliasFano.openPartitioned(blob);
list.nextGEQ(900); list.rank(900); list.stats();   // { chunks, dense, bitmap, eliasFano, bitsPerValue, ... }
```

| 1,000,000 values | Plain | Flat Elias-Fano | Partitioned 128 | Partitioned 256 |
|---|---|---|---|---|
| Sparse (random gaps) | 4,000,000 B | 1,586,608 B | 1,640,416 B | 1,567,380 B |
| Clustered runs | 4,000,000 B | 1,637,752 B | 1,643,980 B | 1,618,508 B |
| About every second number present | 4,000,000 B | 390,720 B | 302,456 B | 245,348 B |
| Bursts like word postings | 4,000,000 B | 776,592 B | 602,752 B | 667,808 B |

First value at or above x, 20,000 lookups, ms (Firefox / Chromium / WebKitGTK, WebAssembly): binary search 3.8 to 4.8; partitioned 3.2 to 3.8 on sparse lists, 2.0 to 2.4 on half-full ones, 2.8 to 3.8 on clustered and posting-shaped ones. Flat Elias-Fano is faster than the partitioned form on clustered, half-full and posting-shaped lists (1.4 to 2.0 ms), so choose the partitioned form for size, not for lookup speed. Single reads (`get`) are about 2x faster than flat Elias-Fano on sparse lists; decoding everything is 0.7 to 1.0x as fast.

The builder is JavaScript only (WebAssembly reads and decodes; both give the same answers). The two forms are different blobs: open them with `open` and `openPartitioned`.

## Intersecting lists (since 1.3.0)
`EliasFano.intersect([a, b, c, ...])` takes opened lists (flat, partitioned, or a mix; up to 64) and returns the values that are in all of them, each once, in order. It walks the lists with `nextGEQ`, starting from the shortest, and never unpacks any of them; WebAssembly does the whole walk in one call. Use it for "which ids match every word" and "which items touch all these links".

Two lists of similar size (shorter list at least 1/32 of the longer) are merged block by block: 256 values of the shorter list are unpacked, the matching stretch of the longer one is found with `nextGEQ` and unpacked, and the two small buffers are merged, so stretches that cannot match are never touched. With a much shorter first list, or when only a few values are left for the third list on, the `nextGEQ` walk is used.

Timings (1,000,000 ids in the big list; Firefox 158 / Chromium 155 / WebKitGTK 2.52.6, ms; test `tests/elias-fano-intersect-browser.js`):

| Intersect 1,000,000 ids with | Plain binary search | Plain linear merge | Flat Elias-Fano | Partitioned 128 |
|---|---|---|---|---|
| 1,000 ids | 0.2 / 0.3 / 0.2 | 3.0 / 2.0 / 1.0 | 0.2 / 0.2 / 0.2 | 0.3 / 0.3 / 0.3 |
| 10,000 ids | 2.2 / 3.9 / 1.3 | 4.0 / 2.6 / 2.0 | 2.3 / 2.1 / 2.0 | 3.0 / 3.3 / 3.0 |
| 200,000 ids | 30 / 65 / 18 | 13 / 12 / 9 | 7 / 8.8 / 8 | 9 / 9 / 9 |
| 1,000,000 ids | 142 / 278 / 73 | 53 / 39 / 29 | 21 / 19 / 19 | 25 / 21 / 21 |
| 3 lists (1M, 200k, 50k) | 11 / 16 / 5 | 7 / 4.9 / 3 | 2 / 2.5 / 2 | 3 / 2.6 / 2 |

Elias-Fano intersection matches binary search on plain arrays when one list is small, and beats even a plain linear merge (by 1.4 to 2.5x) when the lists are of similar size, with the lists taking a sixth to a third of the memory.

## Limits
- Values are whole numbers from 0 to 4,294,967,295; at most 1,073,741,824 values per list or list set.
- Lists must be sorted (duplicates allowed); anything else throws a `RangeError`.
- `open`, `openLists` and `openPartitioned` refuse (RangeError) a blob whose header, section sizes or counts do not add up, or that is truncated or cut, instead of reading past it. For partitioned lists the bits of every chunk are checked against the counts as well; for flat lists and list sets only the headers and offsets are checked (a flipped bit inside the data can give wrong values, never a read outside the blob).
- Little-endian machines only (all browsers on current hardware).
- `buildLists` adds `j × (biggest value + 1)` to list j inside a chunk and cuts a new chunk before that would pass 2^32, so a list set whose values reach 2^32 − 1 is refused.

## Prior art and credits
Peter Elias, "Efficient storage and retrieval by content and address of static files", Journal of the ACM, 1974, and Robert Fano, "On the number of bit sequences", MIT technical report, 1971. The select samples follow the usual practical layout (see Vigna, "Quasi-succinct indices", WSDM 2013); the code here is written from scratch for this repository.

## For AI agents
Load `elias-fano.js` as a page script (global `EliasFano`) or `require` it. Build once, store the `Uint8Array`, `open` it where you read. For "next id at or above x" over a big sorted list use `nextGEQ` or `nextGEQMany`; for many small lists use `buildLists` and `decodeAll` once at startup. Do not call `get(i)` in a hot loop. The source of the WebAssembly is `wasm/ef.c` (build with `wasm/build.sh`, embed with `wasm/embed.py`; `embed.py --check` says whether the file carries the current build).
