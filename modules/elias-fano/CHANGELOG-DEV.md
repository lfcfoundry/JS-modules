# elias-fano developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.6.0 · API 1 · 2026-10-30

### Quick
compact() on flat lists, partitioned lists and list sets (or the open option { compact: true }) drops the JavaScript copy of the bytes once WebAssembly holds them: JavaScript-side memory 1.69 to 0 MB (flat), 1.78 to 0 (partitioned), 1.58 to 0 (list set). Same answers; list-set get(i) about 1.1 to 1.2x the time when compacted. getMany throws RangeError on positions outside the list (it could hang in JavaScript and read past the list in WebAssembly).

### Details
compact(): _wasm() copies the bytes into the arena, then bytes and the typed-array views are set to null; _back() copies them out of WebAssembly memory for the plain JavaScript readers (setBackend('js')) and for free(). After compact(), List.slice (used by Lists.get) reads with ef_get for runs of up to 64 values and ef_get_many above that, instead of copying the bytes back. stats() reports compact: true and the same byte count. getMany guard: one compare per position for a Uint32Array, a whole-number and range check otherwise; getMany time within 1.00 to 1.06x in three browsers (400,000 positions). New test/compact.js: 30 flat and partitioned cases plus a 2,000-list set, WebAssembly, JavaScript and after free().

### Deep
elias-fano 1.6.0: compact() for all list kinds + getMany range guard. Node, JS-side memory after open and one read (wasm memory subtracted): flat 1M ids 1.69 MB -> 0, partitioned 1.78 -> 0, list set 1.58 -> 0. Container speed: flat getMany 1.5.0 vs 1.6.0 vs 1.6.0 compacted, Chromium 9.2/9.5/9.5 ms, Firefox 10/10/10, WebKitGTK 9/9/9; list-set getMany unchanged; list-set get(i) x20k compacted 1.10 to 1.18x (Node, separate processes). Tests: fuzz 400 seeds, intersect, lists-many, partitioned, run, new compact.js.

## 1.5.0 · API 1 · 2026-10-30

### Quick
New Lists.getMany reads many lists in one WebAssembly call.

### Deep
New Lists.getMany(ids) returns several lists at once as { offsets, values } instead of one Uint32Array per get() call; the lists are cut out in WebAssembly (new export ef_gather in ef.c, ef.wasm 10,431 bytes and ef-simd.wasm 10,871 bytes rebuilt; every other function is byte-identical in behavior). Reading 20,000 random lists of a 30,000-list set (94,597 values), median of 25 alternating rounds against a get() loop, cloud container, no noise guard: Firefox 158.0 2.80x faster (14 ms down to 5 ms), ungoogled-chromium 155.0.8059.39-1 2.59x (14.5 ms to 5.6 ms), WebKitGTK 2.52.6 2.40x (24 ms to 10 ms). Plain arrays stay faster (3-5 ms) but take about 2.1x the bytes. Answers are identical to get() in JavaScript and WebAssembly. No size change to blobs and no change to existing calls.

## 1.4.0 · API 1 · 2026-10-25

### Quick
intersect is 1.4 to 2.5x faster than a plain linear merge on lists of similar size: blocks of both lists are unpacked and merged, and stretches that cannot match are skipped.

### Deep
ef_intersect now dispatches: when the longer list is under 32 times the shorter, mergePair unpacks 256 values of the shorter list (efRange or pef_decode_range), finds the matching stretch of the longer one with two nextGEQ and unpacks it in blocks of 512, merging the two buffers (set semantics, repeats emitted once); further lists filter the survivors with nextGEQ and a chunk hint. Otherwise the leapfrog walk of 1.3.0. 1M with 1M (528,926 common): Firefox/Chromium/WebKitGTK 21/19/19 ms vs plain merge 53/39/29 and binary search 142/278/73; 1M with 200k: 7/9/8 vs 13/12/9. 1,932 test cases equal a plain merge. A/B of existing paths in three browsers across three runs: within 5% except single readings (Firefox toArray +7.7%, WebKitGTK decodeAll lists +19% and +5.8%) that did not repeat.

## 1.3.1 · API 1 · 2026-10-25

### Quick
Damaged or hostile blobs are refused when opened (a RangeError) instead of being read past their end: list headers, list-set offsets and partitioned lists are checked.

## 1.3.0 · API 1 · 2026-10-25

### Quick
New: EliasFano.intersect([a, b, ...]) finds the values common to several lists (flat, partitioned or mixed) without unpacking any of them, in one WebAssembly call.

### Deep
Added intersect: leapfrog over nextGEQ from the shortest list, up to 64 lists, flat and partitioned in any mix; ef_intersect in ef.c with a value-returning next (nextOneV, pefNextV with a chunk hint so candidates search on from the last chunk). JavaScript twin answers the same. Tests: 1,848 cases (flat/partitioned/mixed, JS and wasm) equal to a plain merge. Timings in Firefox 158, Chromium 155, WebKitGTK 2.52.6 with the noise guard (one Firefox try was noisy and rerun): as fast as plain binary search for a small second list, slower than a plain linear merge on two large lists. Old-vs-new A/B of existing paths in all three browsers: within -9% to +3%.

## 1.2.0 · API 1 · 2026-10-25

### Quick
New: partitioned lists (buildPartitioned / openPartitioned). Each chunk of 128 values is stored as a plain run, a bitmap or Elias-Fano, whichever is smallest: up to 37% smaller than flat Elias-Fano on dense lists.

### Deep
Added partitioned lists: chunks of 32 to 1024 values (default 128), each coded as dense run / bitmap / Elias-Fano by exact size; directory of first, last, offset, kind per chunk (13 bytes per chunk). Reads (get, nextGEQ, rank, getMany, nextGEQMany, slice, toArray) in WebAssembly (pef_* in ef.c) and in a JavaScript twin; builder is JavaScript only. Sizes for 1,000,000 values: half-full 390,720 flat vs 245,348 (256) bytes; posting-shaped 776,592 vs 602,752 (128); sparse and clustered within 3% of flat. nextGEQ 1.1 to 1.9x faster than binary search, slower than flat Elias-Fano on dense shapes. Old-vs-new A/B in Firefox 158, Chromium 155, WebKitGTK 2.52.6 with the noise guard: flat paths within 5% (first run showed +17% and +6% on 1 ms clock steps; rerun with longer chunks: -10% to +3%). wasm stack size raised 8 KB to 16 KB for the chunk buffer.

## 1.1.0 · API 1 · 2026-10-25

### Quick
New: rank(x) and rankMany(xs) (how many values are at or below x), answered without unpacking. The runtime version now reads the real label.

### Deep
Added rank/rankMany on top of nextGEQ (rank(x) = nextGEQ(x+1) with the top-of-range case handled; rankMany batches into one wasm call). Fixed the runtime version property, which still said 0.1.0 / API 0 after 1.0.0. Twin test now checks rank and rankMany against a filter count in JS and wasm. No change to the format or to existing speed paths.

## 1.0.0 · API 1 · 2026-10-25

### Quick
New module: sorted number lists packed small and searched without unpacking.

### Deep
Shipped in JS-modules PR 175.
New module. Keeps sorted whole numbers in a third to a half of the memory of plain arrays (1,000,000 values: 1.34 MB instead of 4.0 MB; 94,597 links in 30,000 lists: 223 KB instead of 498 KB). Answers 'first value at or above x' 2.3 to 3.0 times faster than binary search in WebAssembly in all three browsers, and decodes a 30,000-list set in 1.5 to 2.0 ms. Random single reads are 14 to 40 times slower than a plain array; use decode-all for those.
