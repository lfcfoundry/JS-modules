# elias-fano

**Version 1.1.0 · API 1**

**Tested in:** Node 22 twin test and 400-seed fuzz (JavaScript and WebAssembly); browsers not rerun, nothing on existing paths changed

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
  list.getMany(idx); list.nextGEQMany(xs); list.rankMany(xs);   // batches: one call into WebAssembly
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

## Limits
- Values are whole numbers from 0 to 4,294,967,295; at most 1,073,741,824 values per list or list set.
- Lists must be sorted (duplicates allowed); anything else throws a `RangeError`.
- Little-endian machines only (all browsers on current hardware).
- `buildLists` adds `j × (biggest value + 1)` to list j inside a chunk and cuts a new chunk before that would pass 2^32, so a list set whose values reach 2^32 − 1 is refused.

## Prior art and credits
Peter Elias, "Efficient storage and retrieval by content and address of static files", Journal of the ACM, 1974, and Robert Fano, "On the number of bit sequences", MIT technical report, 1971. The select samples follow the usual practical layout (see Vigna, "Quasi-succinct indices", WSDM 2013); the code here is written from scratch for this repository.

## For AI agents
Load `elias-fano.js` as a page script (global `EliasFano`) or `require` it. Build once, store the `Uint8Array`, `open` it where you read. For "next id at or above x" over a big sorted list use `nextGEQ` or `nextGEQMany`; for many small lists use `buildLists` and `decodeAll` once at startup. Do not call `get(i)` in a hot loop. The source of the WebAssembly is `wasm/ef.c` (build with `wasm/build.sh`, embed with `wasm/embed.py`; `embed.py --check` says whether the file carries the current build).
