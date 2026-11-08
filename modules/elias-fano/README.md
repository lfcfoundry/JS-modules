# elias-fano

**Version 2.1.2 · API 2**

**Tested in:** Chromium 155, Firefox 158, WebKitGTK 2.52.6

Part of [JS-modules](../../README.md). MIT License, Copyright (c) 2026 LFC Foundry.

## What it is and how it works

Keeps sorted whole numbers (ids, positions, timestamps, graph links) in about a third to half the memory of a plain array, and still answers lookups without unpacking. One file, no dependencies.

- Each number costs about 2 bits plus the bits needed for the average gap.
- "Value number i" and "first value at or above x" stay fast.
- Many lists can share one structure and be decoded together, in WebAssembly when ready.

## Why it exists

Sorted number lists are everywhere, and as plain arrays they cost 4 bytes per number whatever the values. Netflow Map's 30,000 link lists shrink from 498 KB to 223 KB, and LFC-pack uses the same coding for its id lists.

**Where it helps**

- Graph links per item in maps and networks.
- Search indexes (which rows contain a word).
- Row offsets and sorted timestamps.

**Not for:** unsorted data or values above 4,294,967,295.

## Use

The short version:

```js
var list = EliasFano.from([3, 8, 8, 20, 400]);   // sorted numbers in, a searchable list out (the same as open(build(values)))
list.nextGEQ(9);   // 3: the index of the first value >= 9
```

Every call:

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
set.get(2) === set.get(2);   // true since 2.0.0: get(i) keeps the array it made for list i and returns that same array every time; do not change it
var lean = EliasFano.openLists(blob, { cache: false });   // no cache: every get(i) is a new array you may change; set.cache(false) turns it off later
```

Block lists (bitmaps where values are dense, for fast intersections): `buildBlocks` and `openBlocks`, see [Block lists](#block-lists-since-210).

`build` and `buildLists` give a `Uint8Array` you can store or send; `open` and `openLists` read it back. Lists made in JavaScript and in WebAssembly are byte for byte the same. Call `free()` on a list you are done with when WebAssembly is in use (it copies the bytes into its own memory on first use).

That copy means two copies sit in memory while you read: the bytes you opened and the one inside WebAssembly. `list.compact()` (or `open(bytes, { compact: true })`, also for `openPartitioned` and `openLists`, after `await EliasFano.ready()`) lets go of the JavaScript copy, so memory in use halves: 1.69 MB instead of 3.38 MB for a list of 1,000,000 ids. Drop your own reference to the bytes too, or they stay in memory. Answers stay the same. Reading one list at a time from a compacted list set (`get(i)`) takes about 1.1 to 1.2 times as long; `getMany` and single values do not change. `getMany` refuses positions outside the list with a `RangeError` (before 1.6.0 such a position could hang the plain JavaScript reader).

WebAssembly memory only grows: once a big build or many lists have made it bigger, it stays that size until the page closes, even after `free()`. Since 1.7.0, `EliasFano.trim()` gives it back: it starts a fresh copy of the module with a small memory, moves compacted lists across (their only copy), and lets the old memory go; lists that still hold their bytes copy themselves in again the next time they are read, and lists you dropped without `free()` give their space back too. It returns `{ before, after, moved }` in bytes. `EliasFano.autoTrim(true)` does it by itself one tick after a call that leaves less than a quarter of an 8 MB or larger memory in use (on by default; `autoTrim(false)` turns it off). Never call `trim()` from inside a query. In Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6, with the same numbers in all three: twelve compacted 1,000,000-id lists with ten freed, 14.1 MB to 1.8 MB; building one 5,000,000-id list, 24.4 MB to 1.8 MB; a trim takes 1.8 to 4 ms; reading a moved list is as fast as before (200,000 `get` calls 20.2 vs 15.9 ms Chromium, 20.0 vs 19.0 Firefox, 12 vs 12 WebKitGTK). `test/trim.js` checks every answer before and after (also run in the three browsers by `tests/elias-fano-trim-browser.js`).

`EliasFano.setBackend('js' | 'wasm' | 'auto')`, `EliasFano.accelerated()`, `EliasFano.simd()` and `EliasFano.ready()` tell and steer which path answers.

## How it compares
Same page, alternating rounds, Firefox 158 / Chromium 155 / WebKitGTK 2.52.6 (details and method in the repository's test `tests/elias-fano-speed-browser.js`):

| Job | Plain | Elias-Fano |
|---|---|---|
| Size of 94,597 links in 30,000 lists | 498 KB | 223 KB |
| Size of 1,000,000 sorted values | 4.0 MB | 1.34 MB |
| First value at or above x (20,000 lookups, 1,000,000 values) | binary search 4.0 / 3.3 / 3.6 ms | 1.6 / 1.4 / 1.4 ms in WebAssembly (2.3 to 3.0x faster) |
| Read all 94,597 links of 30,000 lists, ms (Chromium / Firefox / WebKitGTK) | arrays of arrays 1.38 / 3.2 (noisy, best 2.1) / 1.5 | decode all in WebAssembly 1.46 / 1.3 / 1.2; `cache(true)`, lists already read once, 1.22 / 1.1 / 0.6 |
| One list at a time, all 30,000, first read (`get(i)`, no cache) | already there, nothing to decode | default (cache on, since 2.0.1): 3.9 / 5.6 / 4.1 ms, against 7.9 / 12.6 / 7.9 ms before 2.0.1 (about 0.5 times); `{ cache: false }`: 7.3 / 12.8 / 9.0 ms (each list is cut out and made into a new array). Still about 3 to 5 times a first read of plain arrays (1.1 / 1.25 / 0.75 ms), which are already there |
| Value number i, 20,000 random reads | 0.05 to 0.1 ms | 1.0 to 3.2 ms (14 to 40x slower) |
| Value number i, the same 20,000 reads in one `getMany` call (since 2.0.2) | 0.05 to 0.1 ms | 0.79 / 0.83 / 0.68 ms (Chromium / Firefox / WebKitGTK; 0.79x to 0.88x the time before 2.0.2; `nextGEQMany` 1.06 / 1.10 / 1.00 ms, 0.83x to 0.87x) |

It is for lists you search or scan, not for hammering single reads: keep a decoded copy (`toArray`, `decodeAll`) when you need those. A list set read list by list keeps each list's array after its first read (the default since 2.0.0; `{ cache: false }` turns it off), and a repeat read then costs about what an array of arrays does, at 4 bytes a value again for the lists you touched. Since 1.10.0 `decodeAll` of 30,000 lists is 0.68 / 0.78 / 0.90 times the time it took (Chromium 155 / Firefox 158 / WebKitGTK 2.52.6, paired runs). Since 2.0.1, once a quarter of the values have been read one list at a time, the set decodes the rest in one go and hands out views (`subarray`) of one decoded array instead of a new array per list (repeat reads 0.8 to 0.9 times the time they took, first read of all lists 0.45 to 0.52 times, Chromium 155 / Firefox 158 / WebKitGTK 2.52.6; a few reads stay separate arrays; the views share one buffer, so do not change them, as before). Plain arrays still win on a first read of a single list (they are already there) and the memory they take is about 2.2 times the packed size (498 KB against 223 KB for these lists); arrays of arrays also cost one object each (not measured here).

### Against other libraries
roaring-wasm 1.1.0 (CRoaring in WebAssembly) and FastIntegerCompression 0.1.0 (varint; given the gaps between values, its best case), 1,000,000 sorted values, one page per browser, median of 11 rounds, ms (Chromium 155 / Firefox 158 / WebKitGTK 2.52.6). Lower is better in every column. Sparse: gaps 1 to 500; dense: gaps 1 to 3; intersect is with a 200,000-value list of the same kind. Block lists are new in 2.1.0 (see below). Libraries are only measured, never copied in.

| Job | elias-fano (flat) | block lists | block lists, `arrays: true` | roaring-wasm | FastIntegerCompression |
|---|---|---|---|---|---|
| Size, sparse | 1,336,608 B | 1,398,768 B | 2,072,584 B | 2,030,536 B | 1,746,299 B |
| Size, dense | 390,728 B | 188,848 B | 188,848 B | 188,608 B | 1,000,000 B |
| First value at or above x, 20,000 lookups, sparse | 1.2 / 1.3 / 1.0 (`nextGEQMany`) | 4.3 / 7.3 / 4.7 | same as block lists | 52 / 50 / 47 (`rank`) | no lookups |
| Same, dense | 0.77 / 1.0 / 0.67 | 1.7 / 3.3 / 3.0 | same as block lists | 8.2 / 7 / 8 | no lookups |
| Is x present, 20,000 lookups, sparse | 2.3 / 2.7 / 2.0 | 2.6 / 3.0 / 2.7 (`containsMany` 2.2 / 2.7 / 2.7) | `containsMany` 1.9 / 2.3 / 2.3 | 3.6 / 4.3 / 4.3 | no lookups |
| Same, dense | 2.0 / 2.7 / 2.0 | 0.7 / 1.3 / 0.67 (`containsMany` 0.33 / 0.67 / 0.33) | `containsMany` 0.33 / 0.67 / 0.33 | 0.8 / 1.0 / 0.67 | no lookups |
| Decode everything, sparse (since 2.1.2) | 4.2 / 4.3 / 4.3 | 2.6 / 3.0 / 1.7 | 2.1 / 2.7 / 1.0 | 2.2 / 2.7 / 1.3 | 7.9 / 12 / 11 |
| Same, dense | 3.7 / 5.0 / 3.7 | 2.8 / 3.0 / 2.0 | 2.8 / 3.3 / 2.0 | 3.2 / 3.3 / 2.0 | 5.6 / 8.3 / 7 |
| Intersect, sparse (since 2.1.2) | 7.0 / 5.7 / 7.3 | 2.0 / 1.7 / 3.0 | 1.2 / 1.0 / 2.0 | 2.7 / 2.7 / 3.3 | none |
| Same, dense (since 2.1.2) | 6.1 / 4.7 / 5.3 | 0.57 / 0.33 / 0.33 | 0.47 / 0.33 / 0.33 | 1.4 / 1.0 / 1.3 | none |

Where elias-fano wins: the smallest size on spread-out values (flat lists 0.66x roaring's, block lists 0.69x), "first value at or above x" (flat lists 7 to 60 times faster than roaring's `rank`), "is x present" (block lists, faster than roaring on both kinds; `containsMany` about twice as fast on dense values), and intersecting (block lists with `arrays: true` 1.3 to 3 times faster than roaring on both kinds; since 2.1.2 default block lists too, which keep the smaller size: 1.4 to 1.6 times faster on spread-out values in Chromium and Firefox, 2.5 to 4 times on dense values). Where roaring still wins: decoding everything on spread-out values (flat lists about 2 times faster, default block lists 1.1 to 1.3 times). Value number i: roaring's `select` gave wrong answers past about 68,000 values in this test (off by one), so it is not compared. The WebKitGTK sparse intersect cells come from fresh frames with one library each (medians of 13 tries, run 4 times): with all libraries on one page that browser showed a 10-40% order bias either way. Test: the repository's `tests/compare/elias-fano-compare-browser.js` (needs `LIBS=<folder with node_modules>`).

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

## Block lists (since 2.1.0)
`buildBlocks` splits the values by their top 16 bits into blocks of 65,536 and stores each block the smallest way: as a bitmap (8,192 bytes, when the block is dense) or as Elias-Fano. With `{ arrays: true }` a block that is not a bitmap is a sorted array of 16-bit numbers instead: bigger on spread-out values, about twice as fast to intersect and decode. Intersecting two block lists goes block by block: two bitmaps are ANDed word by word, a bitmap and a short block test bits, and two short blocks are merged. A block list is a set: a value given twice is kept once.

```js
var blob = EliasFano.buildBlocks(sortedValues);            // or buildBlocks(sortedValues, { arrays: true })
var a = EliasFano.openBlocks(blob), b = EliasFano.openBlocks(otherBlob);
EliasFano.intersect([a, b]);              // values in both (block lists with block lists; mixed with other kinds it falls back to nextGEQ steps)
a.contains(x); a.containsMany(xs);        // containsMany: a Uint8Array with 1 where xs[j] is present (one call into WebAssembly)
a.get(i); a.nextGEQ(x); a.rank(x); a.toArray(); a.stats();   // stats: { blocks, eliasFano, bitmap, array, bytes, ... }
```

Choose block lists for "which ids are in all of these" and "is x present" on dense or mixed data, and flat lists for the smallest size on spread-out values and for "first value at or above x". `get(i)` and `nextGEQ(x)` on a block list are 2 to 7 times slower than on a flat list. `openBlocks` checks the header, the block table and that every block holds its count of values; a damaged block can give wrong values, never a read outside the blob. Block lists have no `compact()`; call `free()` when done, as with the other kinds.

## Limits
- Values are whole numbers from 0 to 4,294,967,295; at most 1,073,741,824 values per list or list set.
- Lists must be sorted (duplicates allowed); anything else throws a `RangeError`.
- `open`, `openLists` and `openPartitioned` refuse (RangeError) a blob whose header, section sizes or counts do not add up, or that is truncated or cut, instead of reading past it. For partitioned lists the bits of every chunk are checked against the counts as well; for flat lists and list sets only the headers and offsets are checked (a flipped bit inside the data can give wrong values, never a read outside the blob).
- Little-endian machines only (all browsers on current hardware).
- `buildLists` adds `j × (biggest value + 1)` to list j inside a chunk and cuts a new chunk before that would pass 2^32, so a list set whose values reach 2^32 − 1 is refused.

## Prior art and credits
Peter Elias, "Efficient storage and retrieval by content and address of static files", Journal of the ACM, 1974, and Robert Fano, "On the number of bit sequences", MIT technical report, 1971. The select samples follow the usual practical layout (see Vigna, "Quasi-succinct indices", WSDM 2013); the code here is written from scratch for this repository.

## For AI agents
Load `elias-fano.js` as a page script (global `EliasFano`) or `require` it. Build once, store the `Uint8Array`, `open` it where you read. For "next id at or above x" over a big sorted list use `nextGEQ` or `nextGEQMany`; for many small lists use `buildLists` and `decodeAll` once at startup, or just call `get(i)`: the cache is on by default, so repeat reads are cheap. Do not change an array `get(i)` gave you, and do not call `get(i)` in a hot loop with `{ cache: false }`. The source of the WebAssembly is `wasm/ef.c` (build with `wasm/build.sh`, embed with `wasm/embed.py`; `embed.py --check` says whether the file carries the current build).
