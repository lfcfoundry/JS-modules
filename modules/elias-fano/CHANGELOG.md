# elias-fano changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 2.4.0 · API 2 · 2026-11-27
- New opt-in stored lists (buildStored/openStored): up to 1,023 values in 0.61 to 0.75x the bytes of a flat list, for lists read rarely.

## 2.3.3 · API 2 · 2026-11-27
- Two tiny lists intersect faster, and nextGEQMany on a tiny list is quicker with a Uint32Array of queries; same answers.

## 2.3.2 · API 2 · 2026-11-26
- Partitioned lists decode faster: whole chunks are decoded 8 values at a time with SIMD.

## 2.3.1 · API 2 · 2026-11-26
- toArray, slice and decodeAll reuse one decode buffer instead of taking memory on every call: mid-size lists decode 9 to 45% faster.

## 2.3.0 · API 2 · 2026-11-22
- New list.view(): the values with no copy, valid only until the next call.

## 2.2.2 · API 2 · 2026-11-22
- toArray on flat lists is up to about 2x faster.

## 2.2.1 · API 2 · 2026-11-22
- Tiny lists read faster.

## 2.2.0 · API 2 · 2026-11-22
- Lists of 63 values or fewer take 0.2x the bytes; batch calls are quicker; an optional pin speeds up lookups on mid-size lists.

## 2.1.3 · API 2 · 2026-11-21
- "First value at or above" no longer crawls through long runs of one repeated value (24 to 42 times faster on a 100,000-copy run); same blobs and answers.

## 2.1.2 · API 2 · 2026-11-07
- Default block lists intersect 1.6 to 1.8 times faster and now beat roaring-wasm on spread-out values in Chromium and Firefox; decoding block lists up to 2 times faster.

## 2.1.1 · API 2 · 2026-11-07
- Block lists: intersecting is 2 to 3 times faster with arrays: true, now faster than roaring-wasm on spread-out lists too (Chromium, Firefox and WebKitGTK).

## 2.1.0 · API 2 · 2026-11-07
- New block lists (buildBlocks, openBlocks): bitmaps where values are dense, so intersecting and lookups beat roaring-wasm on dense data.

## 2.0.2 · API 2 · 2026-11-07
- getMany and nextGEQMany (batches) take 0.79x to 0.88x the time; same answers.

## 2.0.1 · API 2 · 2026-11-06
- Reading all lists one at a time with get(i) is about half the time (0.45x to 0.52x of the first-read time in Chromium, Firefox and WebKitGTK; repeat reads 0.8x to 0.9x).

## 2.0.0 · API 2 · 2026-11-06
- Breaking: Lists.get(i) now keeps and returns the same array for a list (set { cache: false } for the old behavior).

## 1.10.0 · API 1 · 2026-11-05
- Lists: openLists(bytes, { cache: true }) hands out the same array again, so repeat reads match plain arrays; decodeAll is faster.

## 1.9.0 · API 1 · 2026-11-05
- EliasFano.from(values): sorted numbers in, a searchable list out, in one call.

## 1.8.1 · API 1 · 2026-10-31
- Starts a little faster: the built-in WebAssembly program is decoded by the browser's own base64 decoder (Uint8Array.fromBase64) in 0.08 to 0.18 of the old time (cloud tests); older browsers use the old way. Same bytes.

## 1.8.0 · API 1 · 2026-10-31
- Repeat decodes of big lists are 2 to 25% faster by themselves (a spare array is made while idle), and 20 to 35% faster when toArray(out) or slice(a, b, out) fills your own Uint32Array.

## 1.7.0 · API 1 · 2026-10-31
- New: trim() gives back memory that big lists left behind (24 MB to 1.8 MB after a 5-million-id build); autoTrim does it by itself after a big job (on by default; autoTrim(false) turns it off).

## 1.6.0 · API 1 · 2026-10-30
- New compact() halves the memory a list uses while you read it (1.69 MB instead of 3.38 MB for 1,000,000 ids); getMany now refuses out-of-range positions instead of hanging.

## 1.5.0 · API 1 · 2026-10-30
- New Lists.getMany reads many lists in one WebAssembly call.

## 1.4.0 · API 1 · 2026-10-25
- intersect is 1.4 to 2.5x faster than a plain linear merge on lists of similar size: blocks of both lists are unpacked and merged, and stretches that cannot match are skipped.

## 1.3.1 · API 1 · 2026-10-25
- Damaged or hostile blobs are refused when opened (a RangeError) instead of being read past their end: list headers, list-set offsets and partitioned lists are checked.

## 1.3.0 · API 1 · 2026-10-25
- New: EliasFano.intersect([a, b, ...]) finds the values common to several lists (flat, partitioned or mixed) without unpacking any of them, in one WebAssembly call.

## 1.2.0 · API 1 · 2026-10-25
- New: partitioned lists (buildPartitioned / openPartitioned). Each chunk of 128 values is stored as a plain run, a bitmap or Elias-Fano, whichever is smallest: up to 37% smaller than flat Elias-Fano on dense lists.

## 1.1.0 · API 1 · 2026-10-25
- New: rank(x) and rankMany(xs) (how many values are at or below x), answered without unpacking. The runtime version now reads the real label.

## 1.0.0 · API 1 · 2026-10-25
- New module: sorted number lists packed small and searched without unpacking.
