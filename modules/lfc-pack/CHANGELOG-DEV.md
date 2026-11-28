# lfc-pack developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 0.26.6 · API 0 · 2026-11-27

### Quick
Exact value tables (qExact, qn) now cover up to 4,096 different values when each repeats 16 times or more on average; saves are 0 to 8% faster than 0.26.5 despite the extra work. Files and data otherwise unchanged; old readers read them.

### Details
qExact up to 4,096 values (was 257) when values repeat 16x on average; the encoder's wasm pass counts them (numcolc).
Save time vs 0.26.5, same-page swapped A/B (4 pairs, taxi 5 cols 1M rows / retail 2 cols 541,909 rows): Chromium 156 0% / -4%, Firefox 158 -1% / -8%, WebKitGTK 2.52.6 -3% / -3%.
Offsets: 2-byte varint fast path (number encoder 30-40% quicker, same bytes), decimal-digit check in wasm (maxdec), decimal columns read in place by the kernel.
Taxi fare, tip, distance and retail price, quantity now exact; files +0.3% (taxi) to +0.6% (retail) for the tables.

### Deep
Exact value tables at no save cost. Counting runs inside numcol's loop (numcolc: direct-index window of 32,768 from a low sample value, open hash of 8,192 for the rest, folded at the end), only for blocks whose sorted sample gives a Chao1 estimate of at most 3,072 different values. A separate counting pass cost about 2 ns per value in every browser (store-forwarding bound: even a bare counter increment costs that), which alone put saves at +4 to +6%; fused it costs about 1 ns. Offsets with byte-identical files (68 test files compared): putv 2-byte fast path (numcol 12.1 to 6.9 ns per value on taxi fares), maxdec in wasm for decimalScaleW's full pass (retail price paid about 5 ms of JS per save), and nkRun reading DS_INTS in place instead of copying. Tried and dropped: numsum (copy plus wasm summary pass, +11-15% Firefox/WebKitGTK), JS counting fused into blockStats (+9-26% Chromium), NaN-sentinel JS hash (+20% WebKitGTK), run-length and 4-lane counters (no gain). Timing method: two iframes in one page, alternating saves, slots swapped between runs (A/A bias about 3%). Single-thread taxi CPU cost +1.5% Chromium, 0% Firefox before the offsets.

## 0.26.5 · API 0 · 2026-11-27

### Quick
summary() and open().summary() gain estimate(key) (true when a key's answers come from a sampled grid) and exact(key), which decodes only that column and answers quantile, countAbove and countBelow exactly (kept per key; a Promise from ope…

### Deep
summary() and open().summary() gain estimate(key) (true when a key's answers come from a sampled grid) and exact(key), which decodes only that column and answers quantile, countAbove and countBelow exactly (kept per key; a Promise from open()). Real taxi fares: count above 70 reads 13,901 from the grid, 14,453 (true) from exact. Saves and files unchanged.

## 0.26.4 · API 0 · 2026-11-27

### Quick
Summary grids keep 20 points at the shares asked for most (qx: p95, 96, 97, 97.5, 98, 98.5, 99, 99.25, 99.5, 99.75 and the low-end mirror).

### Deep
Summary grids keep 20 points at the shares asked for most (qx: p95, 96, 97, 97.5, 98, 98.5, 99, 99.25, 99.5, 99.75 and the low-end mirror). On real taxi and retail columns those percentiles went from up to 12% off (32% for retail quantity p1) to exact, except two in the sampled middle within the grid's rank error. 31 to 65 bytes more per number column. Old readers ignore qx.

## 0.26.3 · API 0 · 2026-11-27

### Quick
Column summaries take the tail values in the same pass as the range (one read of each block instead of two, and no second pass when many values sit at a cut, as tips of 0), and the summary and pyramid sections go into the file's one footer…

### Deep
Column summaries take the tail values in the same pass as the range (one read of each block instead of two, and no second pass when many values sit at a cut, as tips of 0), and the summary and pyramid sections go into the file's one footer instead of a second footer plus a copy of the whole file. Same summaries; the file is about 2 KB smaller on a million rows; summary CPU about 10% lower in Chromium profiles, whole-save time within noise in all three browsers.

## 0.26.2 · API 0 · 2026-11-27

### Quick
Summary grids list values many rows share (qv), so counts at or near them are no longer 7-21% high on real taxi and retail columns.

### Deep
Summary grids list values many rows share (qv), so counts at or near them are no longer 7-21% high on real taxi and retail columns. Old readers ignore it.

## 0.26.1 · API 0 · 2026-11-27

### Quick
manyDistinctBC/DC (fast mode's nearly-all-distinct test, 1,024 values a column a block) count distinct byte strings or distinct codes first and only decode text when more than 900 differ and a byte is non-ASCII; same answer, same bytes (ch…

### Deep
manyDistinctBC/DC (fast mode's nearly-all-distinct test, 1,024 values a column a block) count distinct byte strings or distinct codes first and only decode text when more than 900 differ and a byte is non-ASCII; same answer, same bytes (checked in 3 browsers on text, dict, row and fast:false saves). From the Beat DuckDB thread: real taxi Workbench import -13 to -15% in Chromium on vendored 0.14.10 (that test was ~27% of pack CPU). Synthetic 200K-row text and dict saves in this repo: within noise in all 3 browsers.

## 0.26.0 · API 0 · 2026-11-26

### Quick
Section 20 grid points in the outer 1/90.5 at each end (the 40 tail points and the even steps that far out) are now exact on sampled columns; same format, same readers.

### Details
Writer only. Each block sorts its sample before its pass (whole hundredths and whole numbers by a two-pass integer radix sort, other values by a top-32-bit radix sort with an insertion fix-up, crowded values by the old full sort), cuts each end a little past 1/90.5 of the block, and the pass keeps every value past the cuts; the merge walks the blocks' sorted ends to the grid's ranks and replaces a point only where every block's cut is inside it. Accuracy (1M-row lognormal 2-decimal column): countAbove(50) 6,497 to 5,912 (exact 5,862), p99 2.5% to 0.4% off; real retail prices (541,909 rows): counts above the 1-in-500 to 1-in-5,000 values from 3-14% off to under 3%. Save cost, alternating runs in one page, 0.26.0 against 0.25.0: real retail 2 columns 0.93-0.97 (Chromium 156, Firefox 158), 1.00-1.02 (WebKitGTK 2.52.6); generated 5 columns (1M rows) 1.00-1.06 (machine noise about 5% here). Footer recompressed at zstd level 1 (was 3): under 0.1% bigger file. Helpers move their summary buffers instead of copying them. Text columns that are not dates are summarized while blocks are still being written.

### Deep
lfc-pack 0.26.0: exact summary tails (see CHANGELOG-DEV details). Tests: quantile.cjs 55 checks (new: tail points exact on 4 sampled columns of 300,000 rows; sort paths exact on 6 kinds of data; the 0.25.0 build fails the tail checks), all lfc-pack checks pass.

## 0.25.0 · API 0 · 2026-11-26

### Quick
Default helper counts now follow core-plan 1.0 (real cores = threads / 2 from 8 threads up, at most half of the memory at 256 MB a helper, at most 8): packParallel, packParallelStream and warmPack use real cores (before: threads, up to 8),…

### Deep
Default helper counts now follow core-plan 1.0 (real cores = threads / 2 from 8 threads up, at most half of the memory at 256 MB a helper, at most 8): packParallel, packParallelStream and warmPack use real cores (before: threads, up to 8), the parallel readers and packRowsParallel use real cores - 1 (before: threads - 1), makePool stays at most 2. A 4-core, 8-thread laptop now packs with 4 helpers instead of 8. Same counts as before on 4-thread machines (the cloud test browsers and Node there), so speed there is unchanged; not measured on 8 threads and more. opts.workers still wins; packParallel gives the same bytes as pack in all three test browsers.

## 0.24.1 · API 0 · 2026-11-22

### Quick
Each block's summary sample keeps middle order statistics instead of endpoint-inclusive spacing; files stay readable by every reader.

### Deep
Sampled quantile grids no longer lean toward the block maximum. Each block keeps the sample values at midpoints (z + 0.5) of its kept ranks instead of spacing that includes both ends, which over-weighted the top. Test column: countAbove(50) 6,396 to 5,812 against an exact 5,805; p99 within 4%. Same file layout, same writer cost. 45 quantile checks.

## 0.24.0 · API 0 · 2026-11-21

### Quick
Section 20 entries add qt: 40 values at shares 2^(-j/2) and 1 - 2^(-j/2), j = 13..32, beside the 257 even steps; quantile/countAbove/countBelow read all 297 points linearly.

### Deep
Section 20 entries add qt: 40 values at shares 2^(-j/2) and 1 - 2^(-j/2), j = 13..32, beside the 257 even steps; quantile/countAbove/countBelow read all 297 points linearly. Old readers ignore qt. Reader-check table (1M rows, lognormal fare): p99.9 107.7 to 72.2 (exact 68.58). Test column: worst tail error 542% to under 5%. Writer: an already-sorted block or a counted small-integer block skips the sample radix sort; per-column summary CPU on 1M rows 18-26% less for such columns (Chromium 156 id 8.1 to 6.0 ms, pax 8.8 to 6.9; Firefox 158 id 12.3 to 10.0, pax 12.9 to 10.6; WebKitGTK 2.52.6 id 7.5 to 5.5, pax 11.5 to 9); skewed float columns unchanged; save totals within machine noise. 44 quantile checks.

## 0.23.0 · API 0 · 2026-11-21

### Quick
Geo: the Hilbert key is no longer stored as a column; section 24 v2 keeps each block's key range (zones).

### Deep
Geo: the Hilbert key is no longer stored as a column; section 24 v2 keeps each block's key range (zones). 1M points: save 570 to 470 ms (Chromium 156), 451 to 393 (Firefox 158), 578 to 453 (WebKitGTK 2.52.6); file 17.27 to 15.70 MB, now 0.7% under a plain save. Box reads unchanged or faster. Column reordering (geo, sortBy, scramble) uses one loop per array type, 1.9-2.8x faster. Views: string labels through a small table before the Map (1.2x Chromium, 2.2x Firefox), cell ids built column by column; same file bytes; save ratio 0.99 / 0.90 / 0.97 of 0.22.0. Dict columns with several missing ids now give one null label. 0.20-0.22 geo files still read; older readers refuse v2 geo sections instead of answering wrong.

## 0.22.0 · API 0 · 2026-11-21

### Quick
Writer option views builds two-way cubes (count, sum, min, max per cell) for label pairs.

### Deep
Writer option views builds two-way cubes (count, sum, min, max per cell) for label pairs. view() reads in 1.5 / 2.2 / 2 ms vs group-by 205 / 163 / 240 ms (Chromium / Firefox / WebKitGTK). Save 204 to 399 / 182 to 315 / 215 to 317 ms when on; off by default. File +0.7%. 18 checks.

## 0.21.0 · API 0 · 2026-11-21

### Quick
Owner card 11.21 8:27 PM Detroit: opt-in pack: true, raw default.

### Deep
Owner card 11.21 8:27 PM Detroit: opt-in pack: true, raw default. graph.pack on packColumnsParallel and addGraph: rows sorted by target (weights alongside; gSortRows), degrees for offsets, in-row gaps for targets, weights as Uint16 ids into one Float32 table (open-addressing table on the bit patterns, exact for -0 and NaN; at most 65,536 values) else raw Float32, each array split into byte planes, zstd level 3 (level 1: same size, same time). Header pack: 1, sorted: true, parts [offset, length, kind], wCount. graph() / open().graph() decode into new arrays (fused plane join + prefix sums). Measured 200,000 nodes / 1,000,000 weighted links, median of 5, 4-core cloud: file 14.61 -> 9.35 MB random links, 14.53 -> 8.55 MB mostly local links (5.8 MB no graph); graph() 35.1 / 30.8 / 26 ms random and 38.1 / 27.4 / 28 ms local (Chromium 156 / Firefox 158 / WebKitGTK 2.52.6) vs raw 8 to 9 ms; save 235 -> 294, 194 -> 246, 188 -> 236 ms random (raw graph -> packed). First draft built the weight table with a Map: save +140 ms Chromium; the bit-pattern table cut it to +59. 20 new checks in graph.cjs (59 in all).

## 0.20.0 · API 0 · 2026-11-21

### Quick
geo: { x, y, bounds?

### Deep
geo: { x, y, bounds? } on packColumnsParallel: 16-bit quantized coordinates, 32-bit Hilbert key (four levels per lookup from a 1,024-entry table; 6.5x faster than the bit loop, same keys) in hidden column $hilbert (section 20 hidden: [...], sortedBy), stable 32-bit radix sort with missing coordinates last (geoPrep sorts, then the sortBy save path with _presort), 1 MB blocks by default, section 24 { x, y, key, bounds, bits, cells: 256, heat: sparse [cell, count] }. Readers: geo(bytes) / open().geo() -> heat Uint32Array(65536); open().bbox(x0, y0, x1, y1, { keys }) splits quads level by level (up to 1,024 edge quads, then whole runs), reads blocks whose $hilbert zone range meets a run, filters exactly; rows.blocksRead. Hidden columns: rowIndexOf now also reads section 20 hidden (key null when no keepOrder). Measured 1,000,000 clustered points (30 clusters) + fare, passengers, kind, median of 5, 4-core cloud: save plain -> geo 209 -> 560 ms Chromium 156, 177 -> 410 Firefox 158, 227 -> 599 WebKitGTK 2.52.6 (first draft 5x: small 8,192-row blocks and the bit-loop key; usual-size blocks were 1.9 to 2.5x but box reads only 1.7 to 4.9x faster); box with 10% of rows 16 of 100 blocks, 40 / 44.5 / 34 ms vs plain read + filter 125 / 96 / 229 ms; box with 19% of rows 84 / 62 / 44 vs 118 / 95 / 209 ms; file +9% (15.8 -> 17.3 MB). New test geo.cjs (35 checks: boxes equal a full scan, prefix property via the heat grid, hidden in every reader, keepOrder, summary false, bounds clamp, errors).

## 0.19.0 · API 0 · 2026-11-21

### Quick
scramble: true | seed on packColumnsParallel, packRows, packRowsParallel: Fisher-Yates over mulberry32 before blocks are cut (src/sort.js scramblePerm, the sortBy path with no key).

### Deep
scramble: true | seed on packColumnsParallel, packRows, packRowsParallel: Fisher-Yates over mulberry32 before blocks are cut (src/sort.js scramblePerm, the sortBy path with no key). No row-position column: unpack / unpackRows { original: true } rebuild the given order from the seed and row count (saved row i is given row P[i]); section 20 says scrambled: { seed } (also with summary: false). Refused with sortBy, keepOrder, exact, base. open().progressive(keys, onStep, { by }): blocks in order, running { n, sum, mean, min, max, estSum } per key and per label of by; onStep returning false stops. Measured 1,000,000 rows x 6 columns (taxi-like: id 0..n-1, fare, distance with 2% missing, passengers, 40 skewed zones, 4 payment kinds), median of 5, 4-core cloud: save 202 -> 308 ms Chromium 156, 206 -> 307 Firefox 158, 194 -> 284 WebKitGTK 2.52.6; first progressive step (1 of 6 blocks, by zone) 11.9 / 18.4 / 9 ms vs all blocks 63 / 100 / 45 ms; first-step mean 0.10% off, worst mean of a zone with at least 1% of rows 1.39% off. Size 4.13 -> 6.63 MB with the sequential id column, 4.11 -> 4.11 MB without it (Chromium run): only columns that follow the row order lose. First draft stored a $row column (keepOrder style): 9.1 MB, dropped for the seed. New test scramble.cjs (27 checks).

## 0.18.0 · API 0 · 2026-11-21

### Quick
S.quantile(key, p), S.countAbove(key, x), S.countBelow(key, x) on the object summary() and open().summary() return (not enumerable, so JSON is unchanged).

### Deep
S.quantile(key, p), S.countAbove(key, x), S.countBelow(key, x) on the object summary() and open().summary() return (not enumerable, so JSON is unchanged). Linear between ranks as the grid is built; a sampled grid's ends are replaced by the entry's min and max; exact on qExact entries (counts summed from qn) and on grids read from every value. Tests (quantile.cjs, 41 checks, 200,000 rows): lognormal, uniform, 70% zeros, negative, a quarter missing, constant, small and wide integers, ascending, all missing (null), dates; worst error under 0.6% of the values, exact entries exact. Measured 1,000,000-row lognormal column, 1,000 quantiles plus 1,000 counts including the footer read, median of 7: 1.8 ms Chromium 156, 2.1 ms Firefox 158, 3 ms WebKitGTK 2.52.6; decode plus sort of the column 204 / 169 / 133 ms. Not done: the quantiles: 1025 writer option from the spec draft; a finer grid would not lower the error, which comes from the 65,536-value sample (0.44% worst).

## 0.17.0 · API 0 · 2026-11-21

### Quick
Footer section 23 (graph): packColumnsParallel graph option { from, to, weight?, directed?, reverse?, nodes?, labels?, nodeIds?

### Deep
Footer section 23 (graph): packColumnsParallel graph option { from, to, weight?, directed?, reverse?, nodes?, labels?, nodeIds? } (column names or arrays) builds CSR by counting sort (links keep their given order per node; undirected stored both ways, self links once) into a raw region after the blocks (8-byte aligned, crc32), plus addGraph(file, g) for any file. Readers graph(bytes[, { verify }]) and open().graph(): Uint32 offsets/targets, Float32 weights, optional reverse index, as views on the file bytes (one copy only when the bytes are not 4-byte aligned). Measured 200,000 nodes, 1,000,000 weighted links, median of 5, 4-core cloud: graph() 9.3/8.5/8 ms with checksum, 0.7/0.8/1 ms verify:false vs 77/58/111 ms unpackColumnsParallel plus CSR build (Chromium 156/Firefox 158/WebKitGTK 2.52.6); save 163->231, 159->206, 141->172 ms; file 5.8 -> 14.6 MB (raw region, no zstd, by spec). Old readers skip section 23 (flags 0).

## 0.16.0 · API 0 · 2026-11-21

### Quick
sortBy: 'key' | ['key','asc'|'desc'] on packColumnsParallel, packRows, packRowsParallel: stable sort before blocks are cut (radix for numbers, dates, timestamps; labels ranked once for dictionary columns; 32-bit prefix radix plus tie runs…

### Deep
sortBy: 'key' | ['key','asc'|'desc'] on packColumnsParallel, packRows, packRowsParallel: stable sort before blocks are cut (radix for numbers, dates, timestamps; labels ranked once for dictionary columns; 32-bit prefix radix plus tie runs for text), empty values last, section 20 sortedBy (written also with summary:false, with keys). keepOrder adds $row (Int32Array of pre-sort positions), section 20 rowIndex; unpack/unpackRows/unpackColumns/unpackColumnsParallel/unpackRowsParallel leave it out unless named; unpack/unpackRows { original: true } restore saved order. Measured 1,000,000 rows, 6 columns, 4-core cloud, median of 7: range read 0.5% of rows 37->4.5 ms Chromium 156, 22->3.5 Firefox 158, 51->7 WebKitGTK 2.52.6; sortBy save 1.94x/1.62x/2.49x of an unsorted save (pack of pre-sorted rows alone ~1.45x in Chromium; columns lose order, +25% size), keepOrder +15% size; ordinary unpack/unpackColumnsParallel unchanged (0.96-1.03 vs 0.15.0, 3 pages). Tried and dropped: gathering string columns as text bytes in sortTable (tied Chromium, 1.2x slower Firefox). Chart bins: PYR_BINS 2048->4096 (netflow-plot draws from bins at >=2 per pixel; file +0.26% vs +0.52% on the test table); pyramids(bytes[, key], { full: true }) attaches a cached full() reading that column (NaN empty, dates ms, us scaled). Summary: text-as-bytes date columns the writer kept as text are now summed as dates (with pyramids). Fix: column tables with NaN in a Float64Array failed the row check and went down the row-object text path (no helpers, no summary parts); now the column path: 1,000,000 rows, 10% NaN: 2104->530 ms Chromium, 1979->502 Firefox, 1972->612 WebKitGTK (3 pages each), same rows read back (file bytes differ slightly: block cuts).

## 0.15.0 · API 0 · 2026-11-21

### Quick
Footer sections 20 (column summaries) and 21 (chart bins) are written by packColumnsParallel and read without decoding; old readers skip them. No breaking change.

### Details
summary(bytes) / open().summary(): per column type, nulls, min, max, sorted, q (257-point quantile grid; exact when ordered, counted or at most 65,536 values; else 65,536 sampled values, worst rank error 0.44% on 400,000 rows), qExact/qn for at most 257 values, text len/distinct/top.
pyramids(bytes[, key]) / open().pyramids(key): { n, bin (rows per bin), min, max (Float64Array, NaN when empty), count (Uint32Array), first, last }, about 2,048 bins.
Cost (1M rows, 13 interleaved pairs, 4-core machine): mixed table +4% Chromium 156, -1% Firefox 158, +2 to +9% WebKitGTK 2.52.6; numbers-only table +27 to +50%. Files +0.4 to +2.4%.
unpackColumnsParallel takes into; unpackColumns text: 'bytes' takes into: { key: { bytes, start, end } }.

### Deep
Summaries ride the writer's own pass over each block (blockStats from b28Col on the helper that encodes the block, and from dateWrap for date columns); the calling thread only merges. First tries cost +19% (a separate pass on the calling thread, which is the bottleneck when text columns are written); helper copies of number columns cost 10 ms of copying; per-block sampling with 1,025 kept order statistics and a radix sort brought the q path from 15 to 8.5 ms per million values. Busy-slot jobs must not run columns that wait on block parts (that made every number column fall back to a whole-column pass). Pitfalls found: TypedArray.prototype.values is a function, so c.values || c broke postMessage in browsers only; a post that throws must remove its answer slot; Firefox is slow with sparse integer keys on a plain object (Map used). Section ids: 22 views and 23 graph reserved.

## 0.14.12 · API 0 · 2026-11-21

### Quick
src/api.js: the `version` the library reports was left at '0.14.8' through 0.14.9 to 0.14.11; it is 0.14.12 now. Found by `versions.py check`. No other change.

## 0.14.11 · API 0 · 2026-11-21

### Quick
`unpackColumnsParallel(bytes, { onBlock(block, index, count) })` (new, optional): called once per block as that block's columns are ready, in the order blocks finish, then the joined result resolves as before. On this thread the blocks are read one at a time with a yield between (through `open().columns(i)`), so the first call comes after one block, not after the last. With helpers it is called from the thread's continuation of each block as the helper answers. A throwing callback rejects the read; a non-function is refused. A file with a raw block (tiny table kept as text) is read in one go and the calls follow. Nothing changes without onBlock.

### Details
600,000 rows (37 blocks of about 1 MB), Chromium 156, whole read of five columns: first block reaches the callback after 3 to 20 ms, half of them after 19 to 87 ms, the read as a whole 79 to 135 ms against 95 ms without a callback (same page, noisy; no slower in the median). The helpers did not start in this headless page (no Worker made), so the on-this-thread path is the one measured.

### Deep
Why not unpackColumns itself: it returns all blocks at once and stays synchronous. A streaming callback needs a yield between blocks (b31Yield), which only the promise-returning reader can give. The joined result is built from the same block objects, so it is the same as before (b35.cjs compares it). Per-piece events in text-columns and zip-open are separate (not in this version).

## 0.14.10 · API 0 · 2026-11-21

### Quick
pool.js: `colTable` makes its 256 preview rows (`CT[z]`) lazily, as getters that build the row when first read, unless a timestamp column is present (those keep the eager check that refuses a value that does not fit its fmt). `estCols` counts the characters of a whole number under 1e15 by comparing against powers of ten instead of `String(v).length`. `packRowsBlocks` skips the size estimate when the table has 1,024 rows or fewer and no head block is asked for (the estimate can only decide where the blocks are cut, and one block is made anyway). Same bytes; no API change.

### Details
Made-up wide table, interleaved in one page, median of 15, new against 0.14.9 (new time as a share of old): 120 columns x 700 rows, Chromium 156 0.62 to 0.70, Firefox 158 0.70, WebKitGTK 2.52.6 0.67; 120 columns x 1,400 rows Chromium 0.97 to 0.99, Firefox 0.98; 4,111 rows Firefox 0.96, Chromium 1.00 to 1.01 (no change). 703 columns x 700 rows Chromium 0.62, x 1,400 rows 0.92. Nothing slower than 5% in any browser tried.

### Deep
Idea, prototype and the 703-column probe: the DuckDB-on-exoplanets thread (files under lfc-workbench/exoplanets-wide-2026.11.21). Not done yet from the same report: a plain Array column makes `estCols` return 0 and the fallback `JSON.stringify(RA.slice(0, 1024))` builds 1,024 row objects (only reached above 1,024 rows now, or when a head block is asked for). Byte identity checked on mixed columns (Float64 with NaN, -0, 1e15+4 and whole numbers; plain arrays with nulls; byte columns; dictionary-like text; empty columns).

## 0.14.9 · API 0 · 2026-11-21

### Quick
`cutNul` (flat.js) cuts the n values of a text column that `text: 'bytes'` returns with a new wasm kernel, `nulpos` in flatscan.c: one 16-byte-at-a-time pass records every zero byte, and `start`/`end` come straight out of wasm memory. The JavaScript loop (one `indexOf` per value) stays for small columns (under 8 KB of bytes), and the no-SIMD case (the decoder-only build carries the SIMD flat scanner, so it takes the wasm cut too). Same `{ bytes, start, end }`, same 'damaged block' error. No API change.

### Details
320,000 near-unique titles (about 7.3 MB), whole `unpackColumns(file, { text: 'bytes' })`, median of 15 in one page: Chromium 156 41 to 25 ms, WebKitGTK 2.52.6 40 to 26 ms, Firefox 158 32 to 31 ms (its `indexOf` is already quick). The cut alone, as a JavaScript loop over a byte buffer instead of `indexOf`: 21 to 17 ms, so the wasm pass is what pays.

### Deep
Kept: the copy `b = u.slice()` (the frame lives in decoder memory) and the one copy of it into the kernel's heap (about 1 ms per 7 MB). `nulpos` stops after n - 1 zero bytes, like the old loop, so extra zero bytes inside the last value are kept. Test: textbytes.cjs gained a 6,000-row column with empty and non-ASCII values (the wasm cut), next to the existing small columns (the JavaScript cut). The plain (no SIMD) flatscan build carries the scalar loop of the same function; the library only calls it when SIMD is present.

## 0.14.8 · API 0 · 2026-11-21

### Quick
flatscan.c: a value is checked for NUL and high bytes with 16-byte loads (a value under 16 bytes with one masked load, a longer one in 16-byte steps plus one overlapping load), in `bcscan` (fallback loop) and `bcscanw`; `bcjoinw` copies whole 16-byte pieces instead of one memory.copy per value. Output is byte-identical; no API change.

### Details
packBlock of 320,000 generated near-unique titles (about 25 bytes, 2,389,045 bytes out) and of titles plus a 10-label column sharing one 9.8 MB buffer (2,525,369 bytes out), new against 0.14.7 taking turns in one page, median of 15 packs: Chromium 156 80.8 to 71.3 ms (-6.7%) and 101.2 to 88.3 (-9.1%); Firefox 158 78.1 to 71.2 (-6.1%) and 102.2 to 94.7 (-7.4%); WebKitGTK 2.52.6 90 to 81 (-9%) and 119 to 107 (-6.4%). 44 SBA-shaped columns (contiguous values): about -5%.

### Deep
Where a title pack goes (Chromium, per pack of 320,000 titles, about 62 ms): the zstd frame 38 to 48 ms (text frames use zstd's fast strategy at level 1 whatever level is passed, so levels 1, 3 and 5 give the same bytes and time), copy of the column into wasm 5, scan 6, join 6, candidate sizing 3, distinct test 3. The zstd wasm built at -O2, -O3 and with SIMD gave the same time (0.96 to 1.03x), so the compiler flags are not the limit; negative levels are slower or bigger. The scan finished each value with a byte loop and the join called memory.copy per value; both were per-value call and tail costs.

## 0.14.7 · API 0 · 2026-11-21

### Quick
flatscan.c: `bcscan` checks a contiguous column range once with 16-byte SIMD (falls back to the per-value loop on a NUL, a gap or a bad offset), and `bc_hash`/`bc_hashw`/`bc_eq` use at most two 8-byte loads for values of 16 bytes or less. The hash only picks table slots and labels are numbered in first-seen order, so output is byte-identical. No API change.

### Details
packBlock of 44 text columns x 20,000 rows (SBA-shaped training stand-in, bytes input, level 3), best of 30 packs per page vs 0.14.6: Chromium 156 99.3 to 94.1 ms (0.962x, 9 pages), Firefox 158 92.1 to 84.3 (0.908x, 9 pages), WebKitGTK 2.52.6 1.019 and 0.912 (2 pages, both orders). Bytes 1,677,784 in both.

### Deep
flatscan.wasm and flatscan-plain.wasm rebuilt with clang 18.1.3 and the same flags as before (the rebuild of the old source reproduced the committed binaries byte for byte). Short-value reads use the 16 spare bytes after the heap copy of B. Remaining profile: zstd about 25%.

## 0.14.6 · API 0 · 2026-11-21

### Quick
The two dictionary candidates of a text column (`cand('D', ...)` with code bytes, and with bit-packed codes) both carried the label bytes `lb`, one of them as `lb.slice()`, so zstd compressed the same frame twice per column. `sizeOf` now keeps one compress result per frame object (WeakMap, keyed by frame, compressor and level) and both candidates pass the same `lb`. Same bytes, no API change.

### Details
packBlock of 44 text columns x 20,000 rows (first 44 columns of the SBA-shaped training stand-in, bytes input, level 3), best of 30 packs per page, alternating pages: Chromium 156 97.6 to 94.4 ms (0.963x, 9 pages), Firefox 158 91.2 to 87.9 (0.968x, 9 pages, all below 1), WebKitGTK 2.52.6 0.971 and 0.853 (2 pages, both orders). Bytes 1,677,784 in both. Compress calls per pack 1,302 to 1,026.

### Deep
After 0.14.5 the Chromium profile had zstd at roughly 25% (wasm-function indexes above 77 belong to zstd-full) and the scan/dictionary kernels near 14%. Counting calls: 1,302 zstd calls and 6.8 MB per pack, 30 calls per column; 223 more calls (343 KB, 5% of bytes) are still content duplicates across candidates and could be shared later. Tried and measured at 0.98 to 1.007x (not shipped): byte-hash distinct test in manyDistinctBC, codes as Int32Array into bitpack, dateNumsBC allocate-after-check, bkPrep range copy, colTable lazy rows (0.995x).

## 0.14.5 · API 0 · 2026-11-21

### Quick
packRowsBlocks sized its blocks from `JSON.stringify(RA.slice(0, 1024))`; for a column table that meant a row object and a TextDecoder string per cell. `estCols` now works out the same number from the bytes (text as bytes, dictionary and Float64Array columns; anything else takes the old way). Same bytes, no API change.

### Details
packBlock of 44 text columns (first 44 columns of the SBA-shaped training stand-in, 20,000 rows, bytes input, level 3, blockBytes 2 MiB), alternating pages, median of steady runs: Chromium 156 168 to 130 ms (0.79x, 7 pages), Firefox 158 140 to 110 (0.88x, 7 pages), WebKitGTK 2.52.6 0.87 and 0.79 (2 pages, both orders). Bytes 1,677,784 in both. Check: 24 packBlock cases (6 text columns with quotes, backslashes, controls, accents, CJK and emoji, a Float64Array with NaN and a dictionary column; blockBytes 65,536 to 4 MiB) gave byte-identical files against 0.14.4; the same check fails (9 of 24) if the estimate is made 15% larger, so it does see block cuts.

### Deep
The Chromium CPU profile of the pack showed decode (TextDecoder) at 12.5%, of which 128 of 185 ms came from packRowsBlocks via slice and rowsOf, plus colTable's 256-row check. The estimate is JSON length of the first rows over the row count, plus 1; `jsonStrLen` counts UTF-16 units of the decoded text plus JSON escapes (quote, backslash, \b \t \n \f \r as 2, other controls as 6, 4-byte UTF-8 as 2 units). PR 807 (previewLen, closed) shortened the preview and was judged on 19 taxi columns only. Left for later: colTable's 256-row check (about 2%), dateNumsBC, bkPrep.

## 0.14.4 · API 0 · 2026-11-21

### Quick
dateMs (the parse of "YYYY-MM-DD HH:MM:SS" and ISO forms in a text column) reads the digits inline and keeps the last year-month-day with its day number, so the calendar arithmetic (dateParts) runs once per day, not per cell. Same bytes, no API change, no new setting.

### Details
packBlock of two 200,000-row timestamp text columns (second steps, a new day about every 50 rows), alternating pages, median of steady runs: Chromium 156 57.7 to 51.0 ms (0.88x, 5 pages), Firefox 158 72.2 to 43.1 (0.66x, 5 pages), WebKitGTK 2.52.6 about 0.87 to 0.92 (two pairs in swapped order; the second page of a pair runs about 15% slower in WebKitGTK, so a 2-page A/B in one order alone showed 1.16 wrongly). Node 22: 35 to 30 ms for one such column. Stored bytes identical in all runs (157,398); 20 cases (4 forms, 5 kinds of bad cell) compared with 0.14.3 byte for byte; test/datecol.cjs and datecol2.cjs pass.

### Deep
Found in the Workbench Save CPU profile (timestamp parse about 21% of a Save): dig() was called six times per cell and dateParts redid the era arithmetic every time. The cache is a module-level (key, days) pair, so a column with unsorted days still gives the right answer, it just misses. Non-digit characters fail one of the 0 to 9 tests, as dig() returned -1 before. The byte path (dateAt, used for text:'bytes' input) is unchanged and could take the same step.

## 0.14.3 · API 0 · 2026-11-20

### Quick
Decimal number columns (Float64Array, 64 rows or more) now check "are these whole numbers times 10^d" in a new wasm kernel (scaleints) instead of a JavaScript loop that allocated a second array. Same bytes, no API change.

### Details
16 typed number columns of the 1.5M-row taxi file, Node, 3 alternating pairs, min of reps: 1229 to 1196, 1222 to 1171, 1211 to 1181 ms (about 3%). Nine Chicago number columns: 41 to 41-42 ms (no change). Bytes identical on both, and on 300 seeded random blocks (ties, -0, NaN, Infinity, 1e15 and 1e16) compared with 0.14.2.

### Deep
scaleints mirrors scaledInts exactly (round half up, 2^50 limit, divide-back check). The 512-value decimals search stays in JavaScript. A profile after the change still shows the number kernels (numcol, numflags) at about 38% and GC at 6%, so the remaining gain needs a fused flags plus load pass, not tried here.

## 0.14.2 · API 0 · 2026-11-20

### Quick
`text: 'bytes'` now covers date columns (type W): { bytes, start, end } with fixed-width values, the same text the string read gives. Opt-in, default read unchanged. A date column with empty cells (stored as N) still comes back as strings.

### Details
1,500,000 taxi pickup timestamps (a 19.4 MB staged file of 1.5M rows, alternating pages, 7 each, steady): strings 251 to bytes 126 ms in Chromium 156 (0.51), 153 to 77 ms in Firefox 158 (0.49), 181 to 120 ms in WebKitGTK 2.52.6 (0.66). Node: 245 to 103-113 ms; dates: 'numbers' is 67-79 ms. Default read against 0.14.1: 1.00 Chromium, 1.02 Firefox, 1.00 WebKitGTK.

### Deep
dateCol writes the digits in wasm (datefmt) and then decodes and splits them into strings; GC for 1.5M strings was 31% of the read. With the option the digit buffer is copied once and start and end are computed (value k starts at k times the width). test/textbytes.cjs checks 1,500,000 values byte for byte against the string read in the manual run and adds three date forms, a column with empty cells and a 100-row block (the JavaScript loop) to its cases.

## 0.14.1 · API 0 · 2026-11-20

### Quick
The wide text kernels from 0.13.7 (16-byte scan, 8-byte hash, memory.copy join) now start at an average value length of 16 bytes (was 24). Same bytes, no API change.

### Details
60,000 rows, 3,000 distinct values of 12 to 21 bytes (average about 17), packBlock bytes input, alternating pages, median of 9: Chromium 156 6.8 to 6.3 ms (0.93x), Firefox 158 6.5 to 6.0 ms (0.94x), WebKitGTK 2.52.6 7.3 to 6.1 ms (0.84x). Values of 8 to 14 bytes (average 11) are unchanged (0.97x to 1.00x, noise), as is the Chicago piece (dictionary input, 0.99x and 1.02x).

### Deep
An earlier try at 12 bytes helped the 17-byte case the same but touched the average-11 case with no gain, so 16 is the lowest start with a measured win. test/bytecol-wide.cjs already covers lengths 10, 15, 16, 17, 23 and compares kernels on and off byte for byte.

## 0.14.0 · API 0 · 2026-11-20

### Quick
New opt-in read option `text: 'bytes'` on unpackColumns and open().columns. Additive: the default still returns strings, nothing old changes. unpackColumnsParallel rejects it (blocks keep their own labels).

### Details
Plain text columns (type s) return `{ bytes, start, end }` (Int32Array offsets into one copied Uint8Array); dictionary columns (type D) return `{ labels, ids }` where labels is `{ bytes, start, end }` shared read-only across blocks that share a label table, ids an Int32Array. Real taxi Save file (200,293 rows, Node, alternating runs): strings 102 to 108 ms, bytes 87 to 90 ms; with dates: 'numbers' 66 to 73 against 52 to 53 ms. With nulls: 'NaN' number-like text columns already return typed arrays, so there the option changes nothing.

### Deep
Built on cutNul (indexOf(0) scan into offsets) and dictBytes in flat.js; the option is scoped by a flag set in try/finally in api.js and turned off while a type N column decodes its inner column. test/textbytes.cjs checks 288 column reads against the string read.

## 0.13.9 · API 0 · 2026-11-20

### Quick
Every packBlock call reads a 1,024-row preview of its columns to size blocks (packRowsBlocks, est) and a 256-row preview in colTable; a { kind: 'ts' } column formatted each preview value on its own (tsText, one dateCol per value). The previews now take 256 formatted values at a time, in order. Same strings, same bytes, no new setting.

### Details
Real taxi columns (200,293 rows, 6 whole-number columns, 10 decimals and 2 timestamps given typed, 16,384-row packBlock calls, steady median of 5 alternating pages): Chromium 156 295 to 247 ms, Firefox 158 253 to 220, WebKitGTK 2.52.6 290 to 226; Node 22 about 207 to 180 ms. test/tspreview.cjs: 20 length cases (1 to 5,000, with and without an empty cell) hash-equal to the same times given as text, and an out-of-range value at index 0, 255, 256, 700 or 1500 reports its own index; it passes on 0.13.8 and 0.13.9.

### Deep
tsText throws on the lowest bad index of its chunk, which is the index the single-value calls reached first when rows were read in order; every bad value is also refused when its block is packed (tsStore), with the same message.

## 0.13.8 · API 0 · 2026-11-20

### Quick
dateMany (does a date or timestamp column hold more than n / 2 different values, so it is written as W and not as a dictionary) counts with an open-addressing table over the doubles' 32-bit halves instead of a Set. Same answer (0 and -0 one value, NaN one value), same bytes, no new setting.

### Details
Node 22, 100,000 dates: mostly distinct 7.8 to 0.64 ms, half distinct 7.1 to 1.7 ms, few distinct 3.2 to 0.5 ms. packBlock of 100,000 rows with two ts columns and one number column (steady, median of pages): mostly distinct Chromium 156 25.8 to 19.0 ms, Firefox 158 17.9 to 13.1, WebKitGTK 2.52.6 19.3 to 16.2; with 20,000 distinct values (text path) Chromium 96 to 86, Firefox 98 to 83, WebKitGTK 77 to 67. test/datemany.cjs pins the n / 2 boundary and 0 / -0, and passes on 0.13.7 and 0.13.8 alike; 54 timestamp cases give identical bytes before and after.

### Deep
Columns that are not a Float64Array, or shorter than 64 values, keep the Set. The table has twice the entries n / 2 + 1 needs, so the scan ends as soon as the count passes n / 2.

## 0.13.7 · API 0 · 2026-11-20

### Quick
byteCol (text column given as bytes) uses three new wide-column WebAssembly functions when the first 64 values average 24 bytes or more: bcscanw (16 bytes per step with SIMD), bcdictw (8-byte hash step) and bcjoinw (memory.copy for values of 16 bytes or more). Same bytes, no new setting, short columns keep bcscan, bcdict and bcjoin.

### Details
Node 22 (V8), packBlock of one 60,000-row column, median of 7, 3 runs: 100 to 180 byte values, 4,000 distinct: 51 ms to 33-40 ms; 30 to 55 byte values, 3,000 distinct: 11 ms to 7.5-8 ms; all-unique 100-180 byte values and 8 to 15 byte values: no change beyond noise. The hash only picks table slots and labels are numbered in first-seen order, so codes and bytes cannot change; test/bytecol-wide.cjs packs 22 cases (lengths 10 to 140, repeats, shared heads and tails, non-ASCII, NUL bytes, empties, invalid UTF-8) with the kernels on and off and compares hashes of the output.

### Deep
The 8-byte hash step follows DuckDB's HashBytes (MIT, https://github.com/duckdb/duckdb/blob/main/src/common/types/hash.cpp); its multiplier comes from martinus/robin-hood-hashing (MIT, https://github.com/martinus/robin-hood-hashing). Values under 16 bytes inside a wide column still use the FNV-1a step. The scan folds 16-byte loads and leaves the same flags (NUL, bytes above 127) and total as bcscan. wasm built with clang 18.1.3, -O3 -nostdlib -fno-builtin -mbulk-memory, with and without -msimd128.

## 0.13.6 · API 0 · 2026-11-15

### Quick
New read option dates: 'numbers' for unpackColumns, unpackColumnsParallel (read on the calling thread) and open().columns: a date column (W) comes back as a Float64Array of epoch values (ms, or us for the six-digit forms) and each block en…

### Deep
New read option dates: 'numbers' for unpackColumns, unpackColumnsParallel (read on the calling thread) and open().columns: a date column (W) comes back as a Float64Array of epoch values (ms, or us for the six-digit forms) and each block entry carries dates: { key: { unit, fmt } }, which the ts input (0.13.4) takes back to write the same column (datesnum.cjs: same bytes after the round trip). Name approved by the owner's card. 200,000 rows with two timestamp columns, steady read, numbers over text: Chromium 156 0.36, Firefox 158 0.32, WebKitGTK 2.52.6 0.24; first call 0.41 and 0.36.

## 0.13.5 · API 0 · 2026-11-15

### Quick
From compression part 7 (pack-fixed-costs diff): decimalsOf answers by round trips for magnitudes 1e-6 to 4e6 and returns 0 for whole numbers below 1e21 instead of formatting each value as text (26,000,000 fuzzed values: 0 differences from…

### Deep
From compression part 7 (pack-fixed-costs diff): decimalsOf answers by round trips for magnitudes 1e-6 to 4e6 and returns 0 for whole numbers below 1e21 instead of formatting each value as text (26,000,000 fuzzed values: 0 differences from the text answer); nanSplit asks the kernel's flags for NaN and passes them on so b28Col does not read a Float64Array column again. Packed bytes identical on NYC 311, taxi job, Chicago piece and a synthetic mix with NaN. Decimal-heavy 16,384-row batch (7 decimal columns, ints, ms and us timestamps as numbers): pack steady new/old Chromium 156 0.89, Firefox 158 0.93, WebKitGTK 2.52.6 0.81 (decimalsOf alone, before the combined diff).

## 0.13.4 · API 0 · 2026-11-15

### Quick
New packBlock column input { kind: 'ts', unit: 's'|'ms'|'us', values: Float64Array (NaN = empty), fmt?

### Deep
New packBlock column input { kind: 'ts', unit: 's'|'ms'|'us', values: Float64Array (NaN = empty), fmt? } (name approved by card pending at build time; asked for by the Workbench Save thread). It writes the same date column (W) the text of those times writes, or the text path's own answer when W does not apply (empty cells, at most half different values), so the bytes equal the text's (tscol.cjs: four forms, ms, us, NaN, errors). Chromium 156, 200,000 rows x 2 timestamp columns plus 3 number columns: first call 256 to 133 ms and 309 to 127 ms, steady 102 to 63 ms and 112 to 73 ms. A value outside 1970-9999 or finer than the form throws; colTable now returns column errors found while reading the first rows instead of throwing.

## 0.13.3 · API 0 · 2026-11-15

### Quick
packBlock turns plain string array columns with few different values (at most a quarter of the rows, under 65,535, no 0 byte or unpaired surrogate, piece at least 4,096 rows and over 1.5 blocks of estimated text) into dictionary inputs, so…

### Deep
packBlock turns plain string array columns with few different values (at most a quarter of the rows, under 65,535, no 0 byte or unpaired surrogate, piece at least 4,096 rows and over 1.5 blocks of estimated text) into dictionary inputs, so the blocks of one piece share a label table per column as 0.13.0 does for dictionary input. _nolabels: true gives the old bytes. NYC 311 piece as plain arrays (14,500 rows x 44 columns, 2 MiB blocks): 1,210,920 to 1,032,993 B (-14.7%); pack steady 0.92 Chromium, 0.87 Firefox, 0.96 WebKitGTK; first call on a fresh page 1.06, 1.26, 1.08. Taxi 16,384-row batch: same bytes (single block, not converted). Format minor 4, readers unchanged.

## 0.13.2 · API 0 · 2026-11-15

### Quick
Shared label tables are written only where they pay: a column with 32 labels or fewer, or one whose piece-wide codes would be wider than a block needs and whose saved labels do not pay for the extra bits, keeps its own labels per block.

### Deep
Shared label tables are written only where they pay: a column whose piece-wide codes would be wider than a block needs, and whose saved labels do not pay for the extra code bits (taxi fares and tolls: 692 labels in the piece, 184 in a block), keeps its own labels per block. A real taxi pack job: 1.2% larger than no tables with 0.13.0, 0.22% larger with 0.13.2 (file 1.0% smaller than 0.13.1). NYC 311 piece: 14.7% smaller than no tables (14.8% before). Same format (minor 4), readers unchanged.

## 0.13.1 · API 0 · 2026-11-15

### Quick
B76 from compression part 6 (owner card 11.15, both browsers): warm({ rows }) runs the plain warm(), then packs the first 3,000 caller rows three times, each in its own task; no bytes change; same promise on repeat calls.

### Deep
B76 from compression part 6 (owner card 11.15, both browsers): warm({ rows }) runs the plain warm(), then packs the first 3,000 caller rows three times, each in its own task; no bytes change; same promise on repeat calls. Cloud first packRows Chromium 156: 113 ms none, 107.5 warm(), 91.6 warm({ rows }); Firefox 158 43/47/43. New test warmrows.cjs.

## 0.13.0 · API 0 · 2026-11-15

### Quick
Shared label tables: a dictionary column handed to packBlock whole as { kind: 'dict', labels, ids } and cut into several blocks writes its labels once in footer section 19 (name = XXH64 of the joined labels); blocks hold only the piece-wid…

### Deep
Shared label tables: a dictionary column handed to packBlock whole as { kind: 'dict', labels, ids } and cut into several blocks writes its labels once in footer section 19 (name = XXH64 of the joined labels); blocks hold only the piece-wide codes (D layout p.sh). Readers register section 19 on opening a file and look tables up by name. 14,500 rows x 44 columns of NYC 311, 2 MiB blocks (11 blocks), 32 dictionary columns: 1,210,920 to 1,031,154 bytes (-14.8%, level 3), 1,213,024 to 1,033,112 (level 1). New test labels19.cjs (rows, columns, equals/anyOf/positions/aggregate, open(), pushPacked stream of two pieces, parallel readers).

## 0.12.3 · API 0 · 2026-11-15

### Quick
Date forms get bit 8: all-whole-second values stored as seconds (times 1,000, or 1,000,000 for six-digit forms, on read).

### Deep
Date forms get bit 8: all-whole-second values stored as seconds (times 1,000, or 1,000,000 for six-digit forms, on read). 200,000 taxi rows, two timestamp columns: text 1,210,650 bytes, 0.12.2 level 3 1,167,952 and level 1 1,654,891, 0.12.3 732,134 and 732,038. Readers (JS, Go, Python) updated; older readers refuse such a file. New test datesec.cjs.

## 0.12.2 · API 0 · 2026-11-15

### Quick
Date column forms 2 to 6 (code part 5, from the taxi pack profile of rivals part 4): W gains a space separator (forms 2, 3, 6) and six fraction digits stored as whole microseconds (forms 4, 6; years up to 2255).

### Deep
Date column forms 2 to 6 (code part 5, from the taxi pack profile of rivals part 4): W gains a space separator (forms 2, 3, 6) and six fraction digits stored as whole microseconds (forms 4, 6; years up to 2255). The wasm kernel datefmt (bdec.wasm) writes them; JS, Go and Python readers and the specs know them; files that use them say format minor 3, older readers refuse them with their unknown-layout error. Taxi-shaped block of 77,000 rows with two timestamp columns (2024-01-01 00:57:55.000000), same page, new over before: pack first / steady Chromium 0.44 / 0.59, Firefox 0.85 / 0.77, WebKitGTK 0.91 / 0.73; file 0.86x; fresh-page first full read Chromium 1.09, Firefox 1.11, steady 0.94 / 1.00.

## 0.12.1 · API 0 · 2026-11-15

### Quick
B74p6 from compression part 6: a Float64Array column with NaN becomes the numbers-and-nulls state in one pass (same bytes as an array with nulls).

### Deep
B74p6 from compression part 6: a Float64Array column with NaN becomes the numbers-and-nulls state in one pass (same bytes as an array with nulls). Same page, new over 0.12.0, 50,000 rows x 6 number columns with empty cells: first pack Chromium 0.24, Firefox 0.19, WebKitGTK 0.28; steady 0.16, 0.16, 0.21; bytes identical. Plus (code part 5): fast on byte columns: byteCol and byteColDict use the fast zstd level and skip the dictionary count when the first 1,024 values are nearly all different, as the string path does; packBlock byte columns now give the same bytes as the same text as strings under fast. Text-heavy byte block (100,000 rows): file 0.54x, steady pack Chromium 0.82, Firefox 0.90, WebKitGTK 0.82; taxi-shaped block (mostly numbers, 2 date text columns): Chromium 1.09 first and 1.03 steady over 16 pages, Firefox 0.93 / 1.02, WebKitGTK 1.01 / 1.03, file +0.05%.

## 0.12.0 · API 0 · 2026-11-15

### Quick
B72 (compression part 6 handoff, owner card 11.15 11:05 AM Detroit 'Yes, default for every save'): opts.fast defaults to on; fast: false keeps the previous bytes.

### Deep
B72 (compression part 6 handoff, owner card 11.15 11:05 AM Detroit 'Yes, default for every save'): opts.fast defaults to on; fast: false keeps the previous bytes. Same bytes as fast: true. Compression part 6 same page, new over 0.11.1: Workbench-style 600k Chromium 0.82, WebKitGTK 0.77, Firefox 0.99; logs 200k 0.95 to 1.00. Files: wb100k 66,670 vs 102,602 bytes, wb600k 300,456 vs 498,182, logs +0.24%.

## 0.11.3 · API 0 · 2026-11-15

### Quick
B72: a date column given as bytes is checked in three 256-value windows (start, middle, end) before the full parse; when each window holds at most 60% distinct dates the column is refused at once (0.11.1 parsed it in full first: +51% on a…

### Deep
B72: a date column given as bytes is checked in three 256-value windows (start, middle, end) before the full parse; when each window holds at most 60% distinct dates the column is refused at once (0.11.1 parsed it in full first: +51% on a 15-distinct column, +54% on a 46% distinct sorted one). B73: the UTF-8 check of a dictionary column looks at the distinct values only (the whole joined column is checked only on the string path); same error text. Both from the text-column thread (real Chicago and 311 data). Page check (34,000 rows; sorted 46% distinct dates, 15-distinct dates, two non-ASCII dictionary columns), new over old, same bytes: pack Chromium 0.61 first / 0.54 steady, Firefox 0.73 / 0.63, WebKitGTK 0.78 / 0.71 (best case: every column here is one the change speeds up). Layout choice can differ only for a column with more than half distinct dates but at most 60% distinct in all three windows; its bytes are unchanged on the test columns.

## 0.11.2 · API 0 · 2026-11-15

### Quick
Row path for every flat table (B71, research handoff from compression part 6, owner card B 11.15).

### Deep
Row path for every flat table (B71, research handoff from compression part 6, owner card B 11.15). b18Pays no longer sends tables under 16 MB of text with mostly new strings to the wasm text scanner, because the row loops since B59-B68 are faster. Same-page, 8 fresh pages, new/old: first save Chromium 0.55/0.56, Firefox 0.38/0.38, WebKitGTK 0.70/0.70 (wb100k/logs60k); steady save Chromium 0.36/0.48, Firefox 0.49/0.49, WebKitGTK 0.49/0.54. Bytes: wb100k 102602 to 113494 (+10.6%, head block kept by owner choice), logs60k 1274297 to 1275108 (+0.06%). Cold-page full read of either file: Chromium 1.05, Firefox 0.96-1.12 (noise, 10 pages). First full unpack right after saves in the same page was 1.38-1.71x in Chromium (JIT timing: the old 100 ms save lets the decoder tier up first); a fresh page reading the file shows no gap.

## 0.11.1 · API 0 · 2026-11-15

### Quick
Firefox only: the dictionary codes of a low-variety text column go into one reused typed array instead of a new array per column.

### Deep
Firefox only: the dictionary codes of a low-variety text column go into one reused typed array instead of a new array per column. Same bytes. Workbench-style save 0.95 of before on Firefox 161.

## 0.11.0 · API 0 · 2026-11-15

### Quick
Date columns: a text column of YYYY-MM-DDTHH:MM:SS(.mmm) dates is stored as numbers and reads back as the same text (new column type W, file format minor 2).

### Deep
Date columns: a text column of YYYY-MM-DDTHH:MM:SS(.mmm) dates is stored as numbers and reads back as the same text (new column type W, file format minor 2). Only used when every cell is a real date in that exact form; other files keep today's bytes. Older readers refuse a file that uses it.

## 0.10.42 · API 0 · 2026-11-14

### Quick
In Firefox, text columns of any size reach the wasm count through one join and encodeInto (the small-table count for 129 to 999 distinct values is off), and the row loop fills text columns by index as Chromium does.

### Deep
In Firefox, text columns of any size reach the wasm count through one join and encodeInto (the small-table count for 129 to 999 distinct values is off), and the row loop fills text columns by index as Chromium does. Same files; Workbench-style score column 62-72 ms to 51-55 ms in the Firefox profile (compression research).

## 0.10.41 · API 0 · 2026-11-14

### Quick
A text column given as bytes whose first value is 16 or more chars (even) or 36 chars goes down the string path only when its first 8 values are all one length and pairwise different (unique hex ids, UUIDs), instead of whenever the first v…

### Deep
A text column given as bytes whose first value is 16 or more chars (even) or 36 chars goes down the string path only when its first 8 values are all one length and pairwise different (unique hex ids, UUIDs), instead of whenever the first value has that length. Same files. Full Chicago crimes import (265 MB, 949,982 rows): 4.02 s to 3.23 s in Chromium 156, 2.77 s to 2.60 s in Firefox 158, 3.72 s to 3.51 s in WebKitGTK 2.52.6, same stored bytes. Rule and measurement from the text-columns research.

## 0.10.40 · API 0 · 2026-11-14

### Quick
Saving rows is faster in Firefox, with logs up to 7% faster (same files): text columns with 129 to 999 distinct values are counted in a small table and long-valued columns reach the wasm count through one join and encodeInto (Firefox only)…

### Deep
Saving rows is faster in Firefox, with logs up to 7% faster (same files): text columns with 129 to 999 distinct values are counted in a small table and long-valued columns reach the wasm count through one join and encodeInto (Firefox only); the row loop checks each row's shape as it reads it (all engines).

## 0.10.39 · API 0 · 2026-11-14

### Quick
Text columns given to packBlock as bytes and offsets are checked, counted and joined in WebAssembly (the same instance as the template builder, 3 new functions in flatscan.c).

### Deep
Text columns given to packBlock as bytes and offsets are checked, counted and joined in WebAssembly (the same instance as the template builder, 3 new functions in flatscan.c). Same files; ten low-variety text columns of a 21,800-row block pack in 0.66x (Firefox 158), 0.80x (Chromium 156) and 0.88x (WebKitGTK 2.52.6) of the time. Idea and kernel from the text-columns research.

## 0.10.38 · API 0 · 2026-11-14

### Quick
packBlock(columns) takes a text column as { kind: 'dict', labels: { bytes, start, end }, ids } (one label number per row; Uint8, Uint16 or Int32 array).

### Deep
packBlock(columns) takes a text column as { kind: 'dict', labels: { bytes, start, end }, ids } (one label number per row; Uint8, Uint16 or Int32 array). The file bytes are the same as packing the same text; packing ten low-variety columns of a 21,800-row block takes about a quarter of the time (Chromium 156, Firefox 158, WebKitGTK 2.52.6). Idea and first version from the LFCP Workbench parse research.

## 0.10.37 · API 0 · 2026-11-14

### Quick
Saving rows is a little faster again in Chromium (about 3-4%, same files).

### Deep
Saving rows is a little faster again in Chromium (about 3-4%, same files). A key in the same position as in the row before reuses that position's column state.

## 0.10.36 · API 0 · 2026-11-14

### Quick
B61 faster row loop in writeFlatBlock0 (b61Loop): whole-row presence plane for rows that repeat the previous key order, and indexed fill instead of push outside Firefox.

### Deep
B61 faster row loop in writeFlatBlock0 (b61Loop): whole-row presence plane for rows that repeat the previous key order, and indexed fill instead of push outside Firefox. Same bytes (85 Node cases in research; test/b61.cjs 32 cases here). Research same-page A/B vs 0.10.35: Workbench-style 600k 0.922 Firefox 158 / 0.962 Chromium 156 / 0.969 WebKitGTK 2.52.6; logs 200k 0.985 / 0.968 / 0.989.

## 0.10.35 · API 0 · 2026-11-14

### Quick
B59 + B60 Firefox-only text counts: a text column of 4,096+ values counts distinct values in wasm (sdz, more than 128 distinct in the first 1,024) or with a 4,096-slot string hash (128 or fewer); Chromium and WebKitGTK keep the Map.

### Deep
B59 + B60 Firefox-only text counts: a text column of 4,096+ values counts distinct values in wasm (sdz, more than 128 distinct in the first 1,024) or with a 4,096-slot string hash (128 or fewer); Chromium and WebKitGTK keep the Map. Same bytes (39 cases, test/b59.cjs forces the flags on). Laptop Firefox 161 against the 0.10.34-equivalent build: Workbench-style 0.713, logs 0.898; cloud Firefox 158 Workbench-style 0.77 x 0.929; same-page 100k logs 0.978 default, 0.95 templates; Chromium 0.97, WebKitGTK 0.99.

## 0.10.34 · API 0 · 2026-11-14

### Quick
fast: true (text columns at zstd level 1, skip dictionary count on nearly-distinct text) and B58b (tplbuild byte-table slot scan, same bytes).

### Deep
fast: true (text columns at zstd level 1, skip dictionary count on nearly-distinct text) and B58b (tplbuild byte-table slot scan, same bytes). From compression research part 4 handoff. fast logs 0.95/0.99/0.98; B58b templates saves 0.92/0.88/0.93 (100k log rows, Chromium 156/Firefox 158/WebKitGTK 2.52.6), default saves within noise.

## 0.10.33 · API 0 · 2026-11-14

### Quick
unpackColumns(bytes, { into: { key: Float64Array } }) writes number columns straight into caller arrays (no fresh 8 MB array per call).

### Deep
unpackColumns(bytes, { into: { key: Float64Array } }) writes number columns straight into caller arrays (no fresh 8 MB array per call). Warm 1M taxi rows: fare 12.6 to 9.4 ms Chromium 156 (0.75), 11 to 9 Firefox 158 (0.82), WebKitGTK 19 to 21 (noise, whole-ms timer); tip 13.4 to 10.8 (0.81), 16 to 13 (0.87), 26 to 21 (0.84). Same sums. Opt-in, no change without it. New test/into.cjs.

## 0.10.32 · API 0 · 2026-11-14

### Quick
templates: true save time 0.52 / 0.57 / 0.60 of 0.10.31 (Chromium / Firefox / WebKitGTK); same bytes

### Details
B57 from compression research part 4: the template layout is built in wasm (tplbuild in flatscan.c, own instance) from the column's joined bytes, with the JS templateFrames as fallback. B57b: templates win without compressing the plain layout in full when their stored size is under 0.8 of its sampled size. B57c: leaner scan loop. flatscan.wasm 21,991 to 25,371 bytes. Templates stay off by default.

### Deep
B57 wasm template builder, sent by the owner ('A: Send now' on compression part 4's card, 4:39 PM).

## 0.10.31 · API 0 · 2026-11-14

### Quick
packRows over 4,096 rows and packRowsParallel record per-column XXH64 checks (+38 bytes on 300k rows); save time within noise

### Details
B55 from compression research part 4: the row path in packManyNow and packRowsBlocks now pass the flat block's prefix size to blockEntry, so B44's per-column checks are written. A one-column read checks only that column. Save time vs 0.10.30 (same page): logs 0.95 / 1.06 / 1.04, taxi 0.94 / 1.03 / 0.97 in Chromium 156 / Firefox 158 / WebKitGTK 2.52.6, all within page noise.

### Deep
B55 integrity fix from compression research part 4 (owner asked for the integrity gap to be closed if under 5% cost).

## 0.10.30 · API 0 · 2026-11-14

### Quick
Log table save 0.90 Chromium, 0.94 WebKitGTK of 0.10.29; Firefox unchanged

### Details
B51: an all-ASCII string column without 0 chars is written straight to its bytes, with no joined string and no TextEncoder pass. Firefox keeps the join path (its TextEncoder is fast). Same bytes on 96 cases (ASCII, logs, non-ASCII, 0 chars, emoji, lone surrogate, few values, empty strings; 10-30,000 rows; auto, level 3, flat).

### Deep
B51 ASCII text columns from compression research part 3.

## 0.10.29 · API 0 · 2026-11-14

### Quick
First aggregate after warm() 4.4/4/5 ms vs 6.3/5/7 (Chromium/Firefox/WebKitGTK); Arrow 21.2.0 5.7/5/11

### Details
B48: sumI/grpI mask empty values to 0 instead of branching, and grpI has a no-null loop. B49: presence-bit counts of 4,096+ bytes run in bdec.wasm (popc). B50: warm() runs 300 tiny calls of each kernel in its own idle task (about 1-4 ms) so the first real aggregate runs in the optimizing tier; init() is unchanged. bdec.wasm 1,087 to 1,515 bytes. Same answers; the warm test checks aggregate before and after warm().

### Deep
Faster first aggregate (B48-B50). The owner picked option C on the card: the kernel warm-up runs in the idle warm(), not in init(). Credits: Daniel Lemire (branchless select), V8 team (WebAssembly dynamic tiering).

## 0.10.28 · API 0 · 2026-11-14

### Quick
unpackColumns, unpackColumnsParallel, open().columns(i) and aggregate read nested blocks as rows, then columns, instead of throwing. Old code is unaffected.

### Details
Bug (LFCP Workbench): auto mode can write a nested block when the first row of a number column is empty (null or ""), often the small first block; column reads then refused the whole file. Now the nested block is read as rows and turned into columns (as 0.10.20 raw blocks are); unpackColumnsParallel reads such a file on the calling thread. Flat-only files read exactly as before; written bytes are unchanged.
Checks: 3 pinned browsers, 6 cases each: 0.10.25 fails 5 of 6, 0.10.28 passes 6 of 6.

### Deep
Workbench bug lead (2026.11.14 1:29 PM Eastern). Reproduced at 1 KB, 4 KB and 64 KB blocks and 2 MB / 500 rows; with "" mixed into numbers the flat column falls back to JSON cells (flat 1.1-2.3x the nested size), with null 0-6%. Reader fix: nestedRowsOf + b39Cols in unpackColumns, open().columns(i) and aggregate; unpackColumnsParallel takes the single-thread path when a nested block is present. test/nestedcols.cjs (76 checks); open.cjs and b35.cjs now expect the read instead of the refusal. Results: js-modules-research/nested-block-columns-0.10.28-2026.11.14/.

## 0.10.27 · API 0 · 2026-11-14

### Quick
packBlock({ key: column }, opts) returns a Promise of a piece for pushPacked; text columns may be { bytes, start, end }, also in packColumnsParallel. Old code is unaffected.

### Details
API: packBlock(columns, opts) when the first argument is a plain object: columns are arrays, number typed arrays (Float64Array read in place) or { bytes: Uint8Array, start, end } (UTF-8, one offset pair per value). Returns a Promise of the piece (packBlock(bytes) stays synchronous). packColumnsParallel accepts { bytes, start, end } too.
Bytes: text given as bytes writes the same file as the same text as strings (plain and dictionary layouts built from the bytes; hex, UUID, IPv4, 0-byte values and templates: true go through the string path).
Speed: build columns from CSV bytes and pack 1,045,512 rows, ratio of median times against string columns: 0.52 Chromium 156, 0.58 Firefox 158, 0.32 WebKitGTK 2.52.6; against JSON text rows (JS builder) 0.28 / 0.32 / 0.20.

### Deep
Column input for streaming packs (owner name pick A, packBlock(columns), 2026.11.14 12:58 PM Eastern) for the LFCP Workbench import (M230 handoff, Firefox-tie finding, finding 41). colTable (pool.js) builds the column table used by packColumnsParallel and packBlock(columns), checks offsets; byteCol (flat.js) encodes { bytes, start, end } text columns: FNV hash table for first-seen labels, the same stop rule as the string Map count (labels * 4 > n), plain 's' frame joined from the bytes, 'D' candidates with the same frames, UTF-8 check once per frame when any byte is >= 0x80; fallbacks to the string path keep the bytes equal. Float64Array number columns are read in place when no helpers are used (packBlock). Checks: test/packblockcols.cjs, 115 checks (same bytes as strings over 13 column kinds x 4 option sets, pushPacked of column pieces, packColumnsParallel bytes columns, inputs unchanged, refused input). Full suite passes. The Firefox text-pack gap (1.5-1.8x Chromium) is gone on this path: 878 vs 843 ms. Results: js-modules-research/packblock-columns-0.10.27-2026.11.14/.

## 0.10.26 · API 0 · 2026-11-14

### Quick
open().block(i, { rows, keys }): the rows at chosen block-local positions, in the order given, without building the other rows of the block. Old code is unaffected.

### Details
API: R.block(i, { rows: [positions], keys: [names] }) -> Promise of row objects, the same objects R.block(i) holds at those positions (a repeated position gives the same object). keys is optional and reads only those keys. A position outside the block throws RangeError; rows that is not a list throws TypeError.
Speed: 2 rows from each of 46 blocks (1.2 million Workbench-style rows, 2 MB blocks), median of 5 reads, 3 fresh pages alternating with 0.10.25's whole-block read: 0.39 Chromium 156, 0.41 Firefox 158, 0.38 WebKitGTK 2.52.6 (ratio of median times). 50 rows per block: 0.44 / 0.27 / 0.36. Same rows in every browser.
At half a block or more, and for nested or raw blocks, the whole block is read and picked from (same speed as before).

### Deep
Chosen-rows read (owner name pick A, 2026.11.14 12:58 PM Eastern) for the LFCP Workbench cold sort: a top-50 page touches about 28 blocks and needs 1-2 rows of each. flat.js readRows sorts and de-duplicates the positions, then each column gives only those values through selAt / decodeAt (the per-position decoders that equality reads use: text, labels, booleans, varint, bit-packed, UUID, hex, IP and null-plane columns); other layouts (templates, arrays, JSON cells) decode whole. Rows are built by selRows (same key order as assemble) and mapped back to the order asked. Fallback to the whole-block path for key-order-list blocks, __proto__ keys, lazy or generated row modes, and when the asked rows are half the block or more. Wired through the arena reader (wasm and JS). Checks: test/blockrows.cjs, 1,064 checks over 13 file shapes (dense, typed, sparse, UUID/hex/IP, nested values, 24-key wide, unicode, templates, nested blocks, exact raw blocks, xxh64, logs, events): same JSON as block(i) picked, repeated rows share the object, keys option, bad positions throw. Full lfc-pack Node suite passes. Results: js-modules-research/chosen-rows-0.10.26-2026.11.14/.

## 0.10.25 · API 0 · 2026-11-14

### Quick
CP2-1: a null-plane number column read with nulls: 'NaN' expands straight from the WebAssembly bit-unpack output instead of copying it out first, skipping one full-size Float64Array per column per block.

### Deep
CP2-1: a null-plane number column read with nulls: 'NaN' expands straight from the WebAssembly bit-unpack output instead of copying it out first, skipping one full-size Float64Array per column per block. 1,000,000 taxi rows, unpackColumns tip (20% empty), median of 6 fresh pages: warm 0.84 (ungoogled Chromium 156, 18 pages per build; a first run on Playwright Chromium 153 gave 0.76) and 0.74 (Firefox 158) of the 0.10.24 time; first call 0.86 and 0.86; two-column zone read 0.88 and 0.88; fare (no nulls) unchanged. WebKitGTK 2.52.6 keeps the JS path (no change; A/B within noise). Same values, bit for bit (checked against 0.10.24 on 100 to 200,000 rows, one and three keys).

## 0.10.24 · API 0 · 2026-11-14

### Quick
faster text-heavy saves, about 0.4% larger logs

### Details
level: 3 gives the old bytes; readers unchanged

### Deep
lfc-pack 0.10.24: B46 LV_FLAT 3 to 2 (flat block column frames at zstd level 2 unless level is given; raw blocks and footer stay at 3; readers unchanged). Owner picked 'A: Level 2 by default' on the research thread's card (11.14 11:55 AM Eastern). Logs 200,000 rows 4,217,768 to 4,234,491 bytes (+0.4%), save 0.86-0.90 of 0.10.23; same page vs lz4-wasm 0.75 Chromium 156 / 0.92 Firefox 158 / 0.82 WebKitGTK 2.52.6 at 0.38 of lz4's bytes. Taxi 300,000 rows same time, 164 bytes smaller. Handoff HANDOFF-B46-flat-level-2-to-code-thread-2026.11.14.md.

## 0.10.23 · API 0 · 2026-11-14

### Quick
faster log and text-column saves, same bytes

### Details
same file bytes as 0.10.22, no new option

### Deep
lfc-pack 0.10.23: B45 one pass over strings in encodeColumn0 (hex and IPv4 checked and packed in one character pass; the text check is one native pass over one join, distinct values only for dictionary columns; distinct count stops at n/4 when the template layout cannot be tried). Same bytes as 0.10.22 (research: logs 200k 4,217,768, taxi 300k 2,832,211; verified here on generated logs 200k/5,000/40 rows with NUL, lone surrogates and emoji, taxi 300k and 1 row: identical). Log save 200,000 rows vs 0.10.22: 0.78 / 0.72 / 0.61 (Chromium 156 / Firefox 158 / WebKitGTK 2.52.6, 4 fresh pages). Same page vs lz4-wasm 0.9.2: 0.85 / 0.93 / 0.98 at 0.38 of lz4's bytes (was 1.34 / 1.38 / 1.59 on 0.10.20). Taxi save guard 0.95 / 0.91 / 1.03, weighted 0.96. Handoff HANDOFF-B45-log-save-to-code-thread-2026.11.14.md (compression part 3).

## 0.10.22 · API 0 · 2026-11-14

### Quick
first-call speedup; per-column XXH64 checks by default

### Details
check: 'crc32' writes the old table; older, Python and Go readers read the files unchanged

### Deep
lfc-pack 0.10.22: B43 warm() covers aggregate and typed column reads in three small tasks, aggregate remembers each block's check across keys; B44 per-column XXH64 checks by default (+85 bytes per block; crc32 still written, older readers unchanged; check: 'crc32' for the old table). Owner approved the default change on the laptop-test card; v2 laptop test 11.14 10:50 AM PASS (Firefox 161 first call 0.50, second 0.50, save 0.85; Chrome 157 0.63, 0.49, 1.03). Cloud first call 13.3/13/12 ms (Chromium/WebKitGTK/Firefox), save cost weighted 1.02. Verified here: suite passes; lfc-pack 0.10.18 and 0.10.19 read a new-default file (rows, equals, unpackColumns) with the same results; 60,000 log rows 1,268,231 bytes vs 1,267,924 with crc32 (+307). Handoff HANDOFF-B43-B44-first-call-to-code-thread-2026.11.14.md. One rejected hunk (warm tail, moved by B39k) applied by hand.

## 0.10.21 · API 0 · 2026-11-14

### Quick
aggregate, nulls: 'NaN', wasm bit-unpack

### Details
No format change; B40 aggregate, B41 wasm bit-unpack (Chromium, Gecko only), B42 nulls NaN

### Deep
lfc-pack 0.10.21: B40 LfcPack.aggregate, B41 wasm bit-unpack for Chrome, Edge and Firefox (Safari-family keeps the JS loop: WebKitGTK 1.19x slower in wasm), B42 nulls: 'NaN' on unpackColumns, unpackColumnsParallel and R.columns; names picked by the owner on cards. Research thread compression part 3 (E43). Handoff HANDOFF-B40-B42-aggregate-to-code-thread-2026.11.14.md. Owner laptop test 11.14 10:21 AM PASS (Firefox 161: aggregate 0.09-0.15 of column loop, row reads 0.75; Chrome 157: 0.05-0.08, 0.92). Verified here: full suite passes, aggregate vs plain loop on 200k taxi rows equal (sums within 1e-6 relative, 260 groups), bdec.wasm reproduces byte-identical from bdec.c.

## 0.10.20 · API 0 · 2026-11-14

### Quick
tiny tables stored as one raw block; zone() is null for one-block files under 100 rows

### Details
same values and key order; files of 100+ rows unchanged

### Deep
lfc-pack 0.10.20: B39k small-file layout, owner sent 11.14 9:25 AM and accepted the under-32-row save slowdown (1.03-1.61, +10 to +60 us) and the zone() change on a card. Handoff HANDOFF-B39k-small-files-to-code-thread-2026.11.14.md. Rebased onto 0.10.19; research switches __B39 and __B39Z removed. b39chk2: 4 fixtures x 13 sizes x packRows/pack/exact, 0 value, key-order or column-type differences; bytes of 100+ row files identical; -0, 1e400, integer keys, empty objects checked; node test/run.js passes.

## 0.10.19 · API 0 · 2026-11-14

### Quick
positions: true gives a Uint32Array of matching row numbers

### Details
No format change; 0.10 to 0.31 of the row read's time on 200k-row tables

### Deep
lfc-pack 0.10.19: positions: true (W1). Owner-named option. New unpackPositions in api.js, readPos in flat.js (block-local selection lists, no rows built); nested, raw and ordered-list blocks use the row path and number the rows. Paired fresh-page timing vs unpack(rows): Chromium 156 common/rare 0.11-0.28, range50 0.16-0.28, range1 0.33-0.47, absent 1.00; Firefox 158 0.10-0.28, absent 1.00; WebKitGTK 2.52.6 (relative only) 0.10-0.31, absent 1.00. Nothing slower.

## 0.10.18 · API 0 · 2026-11-14

### Quick
New unpackRowsParallel: same rows as unpackRows, later reads 0.78 in Chromium and 0.77 to 0.93 in Firefox, longest page pause 34-64 ms instead of 186-305 ms

### Details
Helpers decode blocks; the calling thread builds each block's rows in order with a pause between blocks. The first call reads on this thread and starts helpers for the next call. WebKit browsers, other options, one-block and non-flat files use unpackRows (WebKitGTK helper reads were 1.28 of unpackRows).

### Deep
New unpackRowsParallel(bytes, { workers }): the same rows as unpackRows, with helper-worker decoding and short page pauses (taxi-like 300,000 rows: later reads 0.78 of unpackRows in Chromium 156, 0.77 to 0.93 in Firefox 158; longest pause 34-64 ms against 186-305 ms). WebKit browsers use plain unpackRows.

## 0.10.17 · API 0 · 2026-11-13

### Quick
Equality reads on random-access files run in 0.82 to 0.92 of the time in Chromium; Firefox is unchanged

### Details
The equality reader made three small typed arrays per wanted column per block, which V8 allocates slowly. It now reuses one list in V8. Laptop, 200,000 rows: Chrome 157 0.82 to 0.92 of 0.10.15 on 7 cases; Firefox 161 even.

### Deep
Equality reads on files with many small blocks (such as access: 'random') are 8 to 18% faster in Chromium (Chrome 157 laptop 0.82 to 0.92 of the 0.10.15 time, cloud Chromium 156 0.70 to 0.97); Firefox 161 is unchanged and the rows are identical.

## 0.10.16 · API 0 · 2026-11-13

### Quick
Fixes a bug: a helper-pool read with an equals filter returned every row; it now returns the same rows as unpack and is faster

### Details
pool.unpack(bytes, { equals }) (and anyOf, rows, exact) ignored the filter and returned every row. Those reads now go to the equality reader that unpack uses, which skips blocks that cannot match. Laptop, 200,000 rows: 10% filter 36 ms in Firefox 161 and 29.6 ms in Chrome 157, against 101 and 94.7 ms before, with the wrong rows.

### Deep
pool().unpack with equals (and anyOf, rows, exact) returned every row of the file instead of the matching rows; it now returns the same rows as unpack, and reads are faster (Firefox 161 and Chrome 157, 200,000 rows, 10% filter: 36 and 29.6 ms against 101 and 94.7 ms).

## 0.10.15 · API 0 · 2026-11-13

### Quick
unpackColumnsParallel reads whole tables as columns

### Details
B35: unpackColumnsParallel(bytes, { keys, workers }) resolves to { key: array }; helpers decode blocks, the calling thread joins; typed arrays stay typed, a missing key gives undefined; flat-row files only; first call reads on the calling thread and starts helpers after. 300,000 rows vs unpackRows, first/later: taxi Chromium 0.49/0.30, Firefox 0.55/0.37, WebKitGTK 0.54/0.41; logs 0.74/0.67, 0.83/0.73, 0.80/0.66; sensors 0.41/0.38, 0.61/0.51. Owner laptop Firefox 160 taxi later 0.29, Chrome 157 0.31; longest pause 354 to 46 ms.

### Deep
B35 unpackColumnsParallel (owner named it, laptop Firefox 160 and Chrome 157 passed). API export added by hand; b35.cjs 32 checks (values equal unpackRows by Object.is, first and second call, block sizes, sparse and mixed tables, keys option, nested rejected). All lfc-pack checks pass.

## 0.10.14 · API 0 · 2026-11-13

### Quick
faster row reads in Firefox and WebKit

### Details
B36: outside V8, dense blocks (every key present in every row) are built 1,024 rows at a time, then each column is assigned down the chunk. unpackRows 100,000 rows vs 0.10.13: Firefox 0.85 to 1.02, WebKitGTK taxi later reads 0.82; WebKitGTK sensors first read 1.20 in the cloud test (owner accepted). Identical output on 9 sets x 4 ways of writing in Firefox and WebKitGTK; Chromium unchanged.

### Deep
B36 dense chunked rows, non-V8 only (owner Send B36, then Ship B36 as is after the WebKitGTK sensors first-read card). Output identical to 0.10.13 in Firefox and WebKitGTK. All lfc-pack checks pass.

## 0.10.13 · API 0 · 2026-11-13

### Quick
faster saves for sparse and label tables

### Details
P13i: packRows counts strings seen for the first time under their key in the first 256 rows; 40% or more of values new keeps the text route, otherwise 40% or more strings takes the row path with the 64 KiB head block. Owner laptop, warm saves on sparse and label tables 0.46 to 0.93 of 0.10.8 (Chrome 157, Firefox 160); cloud sparse sets 0.85 to 1.04, logs and sensors unchanged, same bytes. packRowsParallel cuts the same head block.

### Deep
P13i packRows route (owner Send P13i, laptop Chrome 157 and Firefox 160 passed tester v7b). Hand merge of the head block hunk for 0.10.12; packRowsParallel and packRowsBlocks cut the same head block so bytes equal packRows. New check in b28.cjs, 30 checks. All lfc-pack checks pass.

## 0.10.12 · API 0 · 2026-11-13

### Quick
packColumnsParallel saves columns directly

### Details
B34: packColumnsParallel(columns, opts) returns a promise of the file for the rows the columns describe; plain or number typed arrays, same length; skips the string-share gate; same gates and fallbacks as packRowsParallel. 300,000 rows vs packRowsParallel, later saves: taxi 0.66 Chromium, 0.42 Firefox, 0.74 WebKitGTK; sensors 0.73, 0.71; logs 0.93, 0.96, 0.90; first call 0.67 to 0.97. Number tables same bytes as packRows; text-heavy tables can differ by about 0.04% and read back exactly.

### Deep
B34 packColumnsParallel (owner Always column path, named by the owner). Hand merge of two hunks for 0.10.11. New test b34.cjs, 58 checks. All lfc-pack checks pass.

## 0.10.11 · API 0 · 2026-11-13

### Quick
equality reads skip blocks on random-access files

### Details
NX A: random-preset files (blocks of 1 MB or less, 2 or more blocks) keep a Bloom filter per text column per block in a compressed area after the blocks, pointed to by optional footer section 18. Absent lookups 0.24 weighted; random-preset saves 0.95 to 1.03 of 0.10.10 on logs and sensors in three browsers; default saves unchanged; filters also written by packRowsParallel and packParallel; packStream writes none.

### Deep
Block skipping A (owner Send to code thread). Exact checks on the release build: acheck 5,211, check 38,088, rawcheck 56, all 0 bad; 0.10.1 reads the files. Hand merge for the B28 writer; helper stitching carries the filters; hidden option _noeq for tests. All lfc-pack checks pass.

## 0.10.10 · API 0 · 2026-11-13

### Quick
packRowsParallel keeps the page responsive

### Details
B31: packRowsParallel yields between blocks (MessageChannel task). Longest main-thread stall on 300,000 taxi-like rows 210/214/178 ms to 53/29/27 ms (Chromium, Firefox, WebKitGTK); first call 1.04 to 1.08, later saves 0.99 to 1.02 of 0.10.9; same bytes. Owner accepted the cost.

### Deep
B31 yield every block (owner Yield every block). Fixed in review: in plain Node a script ended before the call finished (the port was unref'd); the port now keeps the process alive only while a block waits. b28.cjs 28 checks. All lfc-pack checks pass.

## 0.10.9 · API 0 · 2026-11-13

### Quick
packParallel(file) and faster nested equality and range reads

### Details
B30: packParallel(File or Blob): block cuts come from 64 KB windows, helpers read their own ranges; same bytes, 0.83 to 0.95 Firefox, 0.87 to 0.92 WebKitGTK, faster Chromium; peak memory 31 to 109 MB lower on a 121 MB file. P13g: nested equality and range reads in one pass (laptop Firefox 0.59 to 0.41, Chrome 0.58 to 0.45).

### Deep
B30 Blob-range pack jobs (owner Send B30) and P13g nested one-pass reads (owner laptop test passed). Gate vs 0.10.8: bytes identical in three browsers. New test b30.cjs, 40 checks. All lfc-pack checks pass.

## 0.10.8 · API 0 · 2026-11-13

### Quick
packRowsParallel is new; nested range and window reads are faster

### Details
B28: packRowsParallel(rows, opts) returns a promise of the same bytes packRows writes; number columns of 8,192 values or more are encoded in up to 4 helpers; first call saves on the calling thread. 300,000 taxi-like rows, later saves 0.54 Chromium, 0.58 Firefox, 0.64 WebKitGTK, first call 0.84 to 1.04. P13f: nested range reads and part-block windows build only matching rows (laptop Chrome 0.93 to 0.55, Firefox 1.00 to 0.62).

### Deep
B28 packRowsParallel (research thread, owner chose auto start) and P13f nested ranges and windows (owner laptop test passed). Gate vs 0.10.7: bytes identical on 4 sets and a 76 MB taxi-like table; tables under the 52 MB rule unchanged. New test b28.cjs, 23 checks. All lfc-pack checks pass.

## 0.10.7 · API 0 · 2026-11-13

### Quick
Selected rows (equals, range, row windows) of sparse tables with 20 or more keys are built one row at a time in Chrome and Edge, only when the selected rows look like they benefit. Owner laptop Chrome 157, share of 0.10.6 (first/warm): 40% filter on 27 keys 1.16/0.93 to 0.83/0.63, on 40 keys 1.72/0.88 to 0.81/0.82, row window 1.10/1.01 to 0.77/0.72, id range 0.50/0.50 to 0.44/0.30. Firefox and Safari run the same code. Same rows, same files.

### Details
P13e (owner-approved after laptop test, 2026-11-13 9:57 AM Detroit). V8 only, from 20 wanted keys, gated by the same rowWise() check as 0.10.6. Laptop Firefox 160: same code, warm 0.36 to 1.05 with the same spread as 0.10.5 against 0.10.6. Cloud Chromium 156, 5 to 15 pairs: sparse range reads 0.88 to 1.04, logs 1% range 0.71, dense cells within the 1.05 to 1.14 same-build noise floor (reruns 0.99 and 1.04). 170 exact selective reads 0 differ vs 0.10.6.

### Deep
lfc-pack 0.10.7: P13e selected-row assembly (flat.js, uses rowWise from 0.10.6). Byte-identical (r4cmp.cjs 170 checks 0 differ). No new setting.

## 0.10.6 · API 0 · 2026-11-13

### Quick
0.10.5's row-at-a-time build for tables with missing keys could be up to 1.1 to 1.4x slower in Chrome on tables of 16 to 23 keys where almost no row has every key. It now runs only from 24 keys, or when at least 1 row in 8 of the first 1,024 has every key. Tables of 24 or more keys keep the gain. Same rows, same files.

### Details
Chromium 156, 60,000 rows, full read, share of 0.10.4 time (0.10.5 / 0.10.6): 16 keys 60% present 1.12 / 1.04, 20 keys 60% 1.11 / 0.93, 22 keys 50% 0.87 / 0.92, 27 keys 99% 0.52 / 0.52, 40 keys 50% 0.21 / 0.21. The dictionary-path research thread measured up to 1.4x on the loss cases with fresh pages. 196 exact checks 0 differ vs 0.10.5.

### Deep
lfc-pack 0.10.6: P13d gate rowWise() (shared with P13e): nb >= 24 or at least 1 in 8 of the first 1,024 rows complete. Found by the dictionary-path research thread (round 4). 0.10.5 plain changelog line corrected: the gain is for tables of 24 or more keys.

## 0.10.5 · API 0 · 2026-11-13

### Quick
Full reads of tables with 20 or more keys where rows have different key sets build rows row by row in Chrome and Edge: 0.20 to 0.82 of 0.10.4's time on the owner's laptop. Firefox and Safari run the same code as before. Same rows, same files.

### Details
P13d (owner-approved after laptop test, 2026-11-13 9:10 AM Detroit): V8-only row-at-a-time assembly of sparse blocks (template clone for complete rows, hash-form objects from 24 keys). Laptop Chrome 157, 60,000 rows, share of read-all: 27 keys 99% present 0.93 to 0.50 first read, 40 keys 50% present 0.97 to 0.20, 12 keys unchanged (0.98). Laptop Firefox 160: warm reads 0.97 to 1.03 (code gated off). Cloud check 3 browsers, dense full reads: nothing slower beyond the 0.91 to 1.05 same-build noise floor. 196 exact checks 0 differ vs 0.10.4.

### Deep
lfc-pack 0.10.5: P13d sparse-block row-at-a-time assembly (V8 only, K >= 8 keys). Byte-identical reads (spcmp.cjs 196 checks 0 differ), new test sparseread.cjs.

## 0.10.4 · API 0 · 2026-11-13

### Quick
packRows saves number-heavy tables 0.45 to 0.72 of 0.10.3's time on 100,000-row sets (a wasm number kernel and one row check instead of two). Files are byte-identical.

### Details
B25 + B26 (owner-approved 2026-11-13 8:56 AM Detroit). packRows, 100,000 rows, share of 0.10.3 save time, Chromium 156 / Firefox 158 / WebKitGTK 2.52.6: taxi 0.45 / 0.46 / 0.67, sensors 0.72 / 0.63 / 0.94, logs 0.84 / 0.98 / 0.98, events 1.03 / 0.84 / 0.98. Same bytes on every test set and 15 bail cases.

### Deep
lfc-pack 0.10.4: B25 number kernel (wasm numcol in flatscan, one pass for stats and every candidate frame, 64+ values), B26 folded row check (first and last 1,024 rows up front, the writer bails to the text path on a non-scalar), B25d (checks just before each column is encoded). Files byte-identical to 0.10.3 (same21.cjs, same1.cjs, bail.cjs: 0 diffs). New test numkernel.cjs. B22 stays off the row path (1.2x slower first saves there).

## 0.10.3 · API 0 · 2026-11-13

### Quick
Block reads from open() now decode into the WebAssembly output buffer instead of a second JavaScript copy: memory 32 to 39% lower at 1 to 4 MB blocks. Same rows, same files.

### Details
P15: same-page A/B in WebKitGTK 2.52.6 (12 pages x 30 pairs) P15 on 1.038 +- 0.041 vs off 1.072 +- 0.054 of 0.10.1; Chromium 156 0.994 and Firefox 158 1.019 (research thread, 8 pages each). Fresh-page WebKitGTK runs of one 1 MB-block cell swing 0.92 to 1.14.

### Deep
lfc-pack 0.10.3: P15 wasm arena for open() block reads on by default (LFC_WA=0 turns it off in Node). Owner approved 'ship after A/B' 2026-11-12 10:39 PM Detroit; same-page A/B within noise.

## 0.10.2 · API 0 · 2026-11-12

### Quick
Faster saves (B21), a 64 KiB first block for saves over 4 MiB of text (B22), equals with anyOf, faster mixed-type column searches, faster key-subset and nested equality reads, and an opt-in open().readAhead(). Same file format; old files and old readers work as before.

### Details
Chromium 156 / Firefox 158 / WebKitGTK 2.52.6: save time 0.89 to 1.00 of 0.10.1 on 300,000-row tables; the first screen of a big file takes 6 to 15% of the time; equality reads equal or better than 0.10.1 in all three. File size grows 0.04 to 0.26% on saves over 4 MiB.

### Deep
lfc-pack 0.10.2: B21 faster save writer (byte-identical), B22 small first block over 4 MiB, P13b/P13c key-subset and nested equality reads, P14 B (mixed-type equality) and C (anyOf), B24 readAhead(). Owner-approved 2026-11-12. P15 small-read memory patch held: 1.11 to 1.14 on WebKitGTK 1 MB one-row reads in fresh-page runs (a same-page check by the research thread found none), code kept off by default.

## 0.10.1 · API 0 · 2026-11-12

### Quick
Equality reads (unpack with equals) on text, UUID, hex and IP columns now match in the stored bytes and build only the matching rows: 100,000 log rows, 24 queries took 0.18 to 0.40 of read-then-filter in three browsers (0.42 to 0.70 in 0.10.0). Same rows out, same file format.

### Details
P14 matches the asked value in the stored bytes of text, UUID, hex and IP columns (including nullable ones) and decodes only those rows; P13 builds late-row objects in wide tables from a clone, which also helps range reads. Chromium 156 / Firefox 158 / WebKitGTK 2.52.6, logs 100,000 rows, 24 queries, share of read-then-filter, 0.10.0 to 0.10.1: ip 0.42 to 0.25 / 0.70 to 0.32 / 0.67 to 0.39, id 0.42 to 0.18 / 0.50 to 0.28 / 0.58 to 0.31, msg 0.49 to 0.23 / 0.62 to 0.36 / 0.69 to 0.40; with cache 0.07 to 0.15. 9,688 exact checks pass.

### Deep
lfc-pack 0.10.1: P14 byte-space equality for text, UUID, hex and IP keys and P13 late-row clone (research threads on text matching and dictionary path choice, owner-approved 2026-11-12 10:15 PM Detroit). Equality gate on the combined build vs 0.10.0 in 3 browsers: equals 0.18-0.40 of read-then-filter vs 0.42-0.70; first query 0.20-0.52; cache unchanged or better. check.js 9,688 checks 0 bad. New test eqbytes.cjs.

## 0.10.0 · API 0 · 2026-11-11

### Quick
A column of one kind of value plus some nulls now keeps its compact typed form, with one bit per row marking the nulls (column type N, format minor 1). Made-up files with nullable columns are 19 to 35% smaller and read in 0.45 to 0.69 of the time; real NYC taxi data gains only 0 to 3%. Files without nulls are byte-identical. lfc-pack 0.9.3 and older refuse N files.

### Details
Format minor 1 is written only when a file holds an N column; the API version stays 0. Python and Go readers read N; new vector flat-null-plane. 100,000 rows, 7 fresh-page pairs, new/old: full read 0.45 to 0.69 and 1% range 0.36 to 0.54 on 3 made-up null sets in all 3 browsers; pack 0.75 to 1.21 (Chromium 1.19 orders, 1.21 taxi-like; Firefox 1.08 taxi-like).

### Deep
lfc-pack 0.10.0: null plane (B13). Column type N (format minor 1): a flat column of one scalar kind plus nulls keeps its inner typed encoding for the non-null values and one bit plane marks the nulls. New in the writer (nullBest in src/flat.js, also in the fast writer's mixed-kind columns), reader (decodeColumn), Python and Go readers, LAYOUT-SPEC.md 2.5 and 4, SPEC.md 2.1, vector flat-null-plane, test nullplane.cjs. Footer minor is 1 only when a pack wrote an N column (pack, packStream, packParallel); every other file is byte-identical to 0.9.3 (9 of 9 files checked: logs, sensors, ids, events, repeat, long at 300k rows, FHIR 21 MB, nd_dense, nd_gen_config). 0.8.1 refuses an N file. 100,000 rows, 7 pairs, Chromium / Firefox / WebKitGTK, new/old: orders (6 nullable columns, 34.5% smaller) pack 1.19 / 0.88 / 0.98, full read 0.69 / 0.62 / 0.62, 1% range 0.52 / 0.50 / 0.54; taxi-like (5 columns 2% null, 19.5% smaller) pack 1.21 / 1.08 / 1.05, full read 0.54 / 0.59 / 0.52, range 0.52 / 0.47 / 0.49; every column 50% null (34.6% smaller) pack 0.85 / 0.75 / 0.84, full read 0.54 / 0.45 / 0.55, range 0.48 / 0.36 / 0.42. No-null control logs 300k: pack 0.92 / 0.94 / 1.00, full read 0.88 / 1.13 / 0.99 (same bytes). The pack cost is a first-run cost in the general writer (nullBest, 47 of 360 ms cold in Node). Real NYC taxi gain is 0 to 3% (compression thread E14). Phone not run.
## 0.9.6 · API 0 · 2026-11-12

### Quick
New opt-in packTables(tables, { base }) writes only the rows that changed since a full save, and unpackTables(delta, { base, baseTables }) rebuilds them. Netflow-like data, 8,000 items and 24,751 links, 80 edits: patch 1.4% of a full save, save 0.21 to 0.36 of the time (0.02 with dirty row numbers), read 0.08 to 0.13 with baseTables. Delta files need 0.9.6 or newer to read; full files are unchanged.

### Details
A delta file is an ordinary file whose tables are a patch against a base file (rows inserted, rows removed, values changed), with a required footer section 17 holding the base's XXH64; readers older than 0.9.6 refuse it, and a wrong or missing base throws. Rows are compared as text, so nested rows work. dirty: { table: [row numbers] } skips the comparison when the app knows what it touched. baseTables lets a read skip decoding the base. unpack() of a delta reads whole (no equals, range, keys or lazy). Stacked with the null plane: full file 7% smaller on null data, delta ratios unchanged.

### Deep
lfc-pack 0.9.6: delta saves v2 (owner chose Build into Netflow autosave, 2026-11-12). Chromium 156 / Firefox 158 / WebKitGTK 2.52.6, 8,000 nodes, 24,751 links, 80 edits: patch 1.4%, save 0.16-0.40, with dirty rows 0.02, read 1.00-1.25 (0.08-0.13 with baseTables). Same output as a full save in all runs. Old readers refuse delta files by design. New test delta.cjs.

## 0.9.5 · API 0 · 2026-11-12

### Quick
New option unpack(file, { equals: { key, value } }) returns the rows whose value is exactly that, building only those rows: 0.47 to 0.82 of read-then-filter over 24 queries, 0.06 to 0.20 with cache: true (3 browsers). Column reads of JSON-per-cell columns and large number columns are faster (Chromium 0.63 to 0.88 on logs, sensors and taxi columns). No format change.

### Details
equals tests one column, skips blocks whose dictionary lacks the value, and decodes only the matching positions when at most 1 row in 8 matches; common values assemble from the columns already read. cache: true keeps decoded blocks between queries on the same file bytes, counted and capped by LfcPack.cacheLimit() (64 MB default, least recently used first); LfcPack.clearCache() empties it. Cached first queries can cost up to 1.09 of a plain read. Column reads: an all-null JSON column is filled from its bytes (every engine); null, true, false and whole numbers up to 15 digits are read by hand in Chromium and Firefox; zigzag number columns of 16,384 values or more decode in one pass. Same rows and values.

### Deep
lfc-pack 0.9.5: B19 and B19c equality reads with an opt-in cache (size limit, clearCache), and B20 column reads (compression thread research, owner-approved 2026-11-12). Option names (cache: true, cacheLimit, clearCache) chosen by the owner 2026-11-12. Stack gate on 0.9.4 in 3 browsers: equality 24 queries 0.47-0.82 of read-then-filter, with cache 0.06-0.20 (first cached query up to 1.09); B20 columns vs 0.9.4 0.63-1.04 and rows 0.78-1.01 (cells over 1.05 on repeat were noise: identical builds measured 1.05 in the same harness). New tests equalsread.cjs, b20cols.cjs.

## 0.9.4 · API 0 · 2026-11-12

### Quick
packRows on plain rows over 4,096 rows now goes straight to the column writer with no JSON text step: 0.50 to 0.65 of the time on taxi-like and orders sets in 3 browsers. Same format, same rows; files under the gate are byte-identical.

### Details
packRows(rows) skips the JSON text for plain scalar rows (strings, booleans, null, finite numbers other than -0) when there are more than 4,096 rows and either the rows would make more than 16 MB of text or fewer than 40% of the cells in the first 256 rows are strings; the writer tries both varint forms like the wasm writer, so files stay within 0.0002% of before. Other rows, and every call with exact, block or share, take the old path. 5 fresh-page pairs, packRows new/old: taxi-like 0.65 / 0.59 / 0.64, orders 0.57 / 0.50 / 0.50, sensors 0.87 / 0.71 / 0.90, ids 0.95 / 0.87 / 0.78 (Chromium / Firefox / WebKitGTK); logs 300k 0.84 / 1.04 / 0.99; an identical-build control swung 0.89 to 1.11.

### Deep
lfc-pack 0.9.4: B18b, packRows straight from row objects (the compression thread's research, owner-approved 2026-11-12). Gate and size fix as in the research notes. Keys are listed first-seen per block as before; a later block can list keys in another order, with identical values. New test rowpath.cjs.

## 0.9.3 · API 0 · 2026-11-11

### Quick
A range read of a file of flat rows now decodes the range column first and builds row objects for the matching rows only. A 1% range takes 0.35 to 0.81 of the time on 300,000-row logs and sensors. Same rows, same files, no format change.

### Details
unpack(file, { range }) on a flat block lists the matching rows from the range column, then builds only those rows (a block wholly inside the range skips the test; a block where more than half the rows match goes the old way; nested blocks, key-order lists and __proto__ keys go the old way). 300,000 rows, 1% range, new/old, 7 pairs: Chromium logs 0.62, sensors 0.35; Firefox logs 0.81, sensors 0.47. Full reads 0.99 to 1.06 (A/A control 1.03).

### Deep
lfc-pack 0.9.3: B14, range reads build only the rows they keep (read path only; no format change). Same rows on 90 of 90 range-read checks (6 ranges x 3 key choices, 5 sets) and in the new test rangesel.cjs (plain, null, missing, text and optional-key range columns, mixed key order, 40 to 20,000 rows, small blocks). 300,000 rows, 7 fresh-page pairs, 1% range new/old: Chromium 156 logs 0.62 and sensors 0.35, Firefox 158 logs 0.81 and sensors 0.47, WebKitGTK 2.52.6 sensors 0.70 (9 pairs). Full reads Chromium 0.99 / 0.99, Firefox 0.99 / 1.06, WebKitGTK 1.06 (15 pairs, A/A control 1.03). Phone not run. The 4 MB flat-block default that was approved with B14 is not in this release: with it a 1% range takes 0.17 to 0.43, but WebKitGTK full reads on sensors take 1.20 and parallel pack 1.18, so it waits for an owner card.

## 0.9.2 · API 0 · 2026-11-11

### Quick
UUID columns are converted to 16-byte values in wasm straight from the input, with no strings made: pack takes 0.42-0.56 of the 0.9.1 time on UUID-heavy blocks. Same bytes, same format.

### Details
hexcols also recognizes lowercase UUID columns (8-4-4-4-12) and writes 16 bytes a value; a bad value anywhere sends the key back to the old path. 60,000 rows with two UUID columns, pack new/old: Chromium 0.55, Firefox 0.42, WebKitGTK 0.56. Controls neutral.

### Deep
lfc-pack 0.9.2: UUID columns of the fast flat writer are read straight from the input bytes in wasm (hexcols extended: sentinel 3600 for a column of lowercase UUIDs, 16 bytes a value), so no JavaScript strings, no regular-expression check and no per-value conversion. Found by profiling 0.9.1 on a 300,000-row ids set: the UUID shape regex was 9% and string making 7 to 12%. Pack time new/old vs 0.9.1, 9 paired fresh pages, 60,000 rows with two UUID columns: Chromium 156 0.55 (202 to 112 ms), Firefox 158 0.42 (175 to 73), WebKitGTK 2.52.6 0.56 (167 to 94); Node ids-300k 503 to 355 ms. Controls, 9 to 15 pairs, 150,000 rows, Chromium / Firefox / WebKitGTK: logs 1.00 / 0.88 / 1.01, sensors 0.99 / 1.01 / 1.02, nested 0.96 / 0.90 / 1.01, long numbers 1.02 / 0.91 / 1.01. Bytes identical to 0.9.1 on 36 of 36 adversarial UUID sets (upper case, wrong dashes, wrong lengths, 36-character hex, nulls, late bad value), 41 of 41 b7verify sets, FHIR 21 MB, ids and events at 300k rows, a Netflow map and mixed.ndjson. Phone not run.

## 0.9.1 · API 0 · 2026-11-11

### Quick
A key with mixed kinds of value (numbers with null, numbers with text) stays on the fast flat writer: pack takes 0.70-0.93 of the time where up to about half the cells are mixed, even where nearly all are. Same bytes, same format.

### Details
Keys whose values are of more than one JSON kind keep their first type; later cells are kept as literals and one JSON.parse reads a key's literals. The scanner stops early once more than half of the cells are literals, so all-mixed blocks take the old path. 150,000 rows, pack new/old vs 0.9.0 (Chromium 156/Firefox 158/WebKitGTK 2.52.6): 1 mixed column of 13 0.70/0.72/0.74, 6 of 13 0.93/0.93/0.84, all-mixed worst cases 0.99-1.04. Plain flat and nested controls neutral.

### Deep
lfc-pack 0.9.1: keys with mixed kinds of value stay on the fast flat writer (owner approved 11.11, 'Send it' on the mixed-values card). Patch b3b-mixed-kinds.diff (v3) from the 11.11 research, applied on 0.9.0 with no conflicts; flatscan.wasm and flatscan-plain.wasm rebuilt with clang 18.1.3 (tpl4.wasm and rowscan.wasm byte-identical). Pack time new/old vs 0.9.0, 9 paired fresh pages, 150,000 rows, Chromium 156 / Firefox 158 / WebKitGTK 2.52.6: mix1 (1 of 13 columns nullable) 0.70 / 0.72 / 0.74, mix6 0.93 / 0.93 / 0.84, worst cases allmix 1.02 / 1.04 / 1.03 and allmixu (non-ASCII) 1.01 / 0.99 / 1.02 (everything mixed; the scanner bails early so they take the old path). Plain flat and nested controls, 11 to 15 pairs: logs 1.00 / 1.02 / 1.01, sensors 1.04 / 0.96 / 1.01, nested 1.00 / 0.93 / 0.99 (15 pairs), nd_dense 0.96 / 1.01 (15 pairs) / 0.98 (15 pairs). Bytes identical to 0.9.0 on 41 of 41 sets (b7verify: research sets, worst and mixK sets, mixed-kind pools, corpus files). Phone not run.

## 0.9.0 · API 0 · 2026-11-11

### Quick
pool.unpack keeps the reviewed Buffer fix (each block sent to a helper is an exact-size private copy; the parent transferred a Buffer slice that aliased caller memory and failed with "Cannot transfer object of unsupported type"). New, opt-in: { stable: true } copies a block only when a helper takes it; pool({ maxInflightBytes }) is a byte limit on posted blocks (worker count limits jobs, not bytes; a block over the limit runs alone); { signal } cancels a read (queued blocks dropped and released at once, posted blocks released when their helper answers; the pool keeps working); pool.stats(). Defaults unchanged: copy at call, no byte limit.

### Details
Node 22.23.4, worker_threads, stalled helpers (every post held), 3,098,190-byte file in 40 blocks, 2 helpers: private copies held while stalled, default 3,100,083 B of ArrayBuffer growth (all 40 blocks; the 0.8.1 parent did the same for a Uint8Array and failed for a Buffer); stable 315,158 B (4 blocks posted); stable + maxInflightBytes 1.5 blocks 81,408 B (1 block). Six calls at once, limit 2 blocks: 78,551 B held, 239 jobs queued without copies. Cancel: 36 queued dropped, 4 posted released on answer, next read correct. Byte counts only; no timings (speed is measured only in the test browsers).

### Deep
test/pool-budget.cjs; handoff evidence docs/codex-handoffs/claude-2026-11-11/evidence/pool-budget-*.json. Not covered: concurrent writes to a SharedArrayBuffer during the copy (no atomic snapshot), mutation during synchronous wasm decode, decoded-output retention (Promise.all keeps every block's rows until the call ends), browser Web Workers.

## 0.8.3 · API 0 · 2026-11-11

### Quick
Rows with numbers that have more than 15 digits, an exponent or -0 stay on the fast flat writer: pack takes 0.74-0.94 of the time on such blocks. Same bytes, same format.

### Details
The scanner no longer gives up on a whole block at one long number; that key keeps the number's text and goes through the per-column writer. Blocks of 256 KB or less in auto mode still compare nested and flat as before. 150,000 rows, pack new/old (Chromium/Firefox/WebKitGTK): long full-precision numbers 0.85/0.74/0.91, exponent numbers 0.83/0.86/0.94. Controls (logs, sensors, nested) neutral.

### Deep
lfc-pack 0.8.3: long numbers stay on the fast flat writer (owner approved 11.11 'Send it'). Patch from the 11.11 research (b3-long-numbers.diff with the k67 guard) plus a faster cell conversion: the first version converted each kept number with String.fromCharCode on a subarray, which made all-long-number data 1.1 to 1.6x slower on Firefox and WebKitGTK; slicing the already decoded text (ASCII input) fixed it. flatscan.wasm and flatscan-plain.wasm rebuilt with clang 18.1.3; tpl4.wasm and rowscan.wasm byte-identical. Pack time new/old vs 0.8.2, 9 paired fresh pages, 150,000 rows, Chromium 156 / Firefox 158 / WebKitGTK 2.52.6: long full-precision numbers 0.85 / 0.74 / 0.91, exponent numbers 0.83 / 0.86 / 0.94; controls logs 1.00 (15 pairs) / 0.86 / 1.01, sensors 0.97 / 0.87 / 1.02, nested 0.96 / 1.01 / 1.03 (15 pairs). Bytes identical to 0.8.2 on 17 research and edge sets (b3verify), FHIR 21 MB, Netflow maps 8,000 and 30,000 items, a Netflow QA map, a fonts table, mixed.ndjson, sensors and ids at 300k rows; none larger. Phone not run.

## 0.8.2 · API 0 · 2026-11-11

### Quick
Pack is faster: UUID columns convert with char codes (0.61-0.73 of the time on UUID-heavy blocks) and each column's layout is chosen from a 64 KB sample (0.78-0.96 on number and log data). Same bytes, same format.

### Details
B1: UUID text to bytes with char codes (pack time new/old, 60,000 rows with two UUID columns: Chromium 0.73, Firefox 0.65, WebKitGTK 0.61). B2: each candidate layout's size is estimated (frames up to 64 KB exact, longer ones from four 16 KB slices) and only the winner is compressed in full; when the best two estimates are within 2% both are compressed and the smaller kept. 150,000 rows, pack new/old: logs 0.94/0.94/0.96, sensors 0.88/0.92/0.78, nested control 1.04/0.88/0.95 (Chromium/Firefox/WebKitGTK). Files are byte-identical to 0.8.1 on every file tried.

### Deep
lfc-pack 0.8.2: two pack speedups, same format and same bytes (owner approved 11.11 'Send both'). B1: UUID columns convert text to bytes with char codes: pack new/old on 60,000 rows with two UUID columns, 9 pairs, Chromium 156 0.73 (354 to 258 ms), Firefox 158 0.65 (278 to 181), WebKitGTK 2.52.6 0.61 (316 to 194). B2: each flat column's layout is chosen from a sample; frames up to 64 KB are compressed exactly, longer ones are estimated from 4 evenly spaced 16 KB slices and only the winner is compressed in full; when the best two estimates are within 2% both are compressed in full and the smaller kept. 150,000 rows, 9 pairs, new/old pack: logs Chromium 0.94, Firefox 0.94, WebKitGTK 0.96; sensors 0.88 / 0.92 / 0.78; nested control 1.05 (1.04 in 15 more pairs) / 0.88 / 0.95. Size gate: byte-identical to 0.8.1 on FHIR 21 MB and 260 MB, Netflow test maps 2,000 / 8,000 / 30,000, mixed.ndjson, fnmap, google-fonts table, and 10 made-up sets (logs, events, sensors, ids, repeat at 20k and 300k rows); none larger. Phone not run.

## 0.8.1 · API 0 · 2026-11-08

### Quick
unpack(bytes, { keys }) on nested blocks now builds only the keys you ask for (it used to build every row in full and then drop keys). Same output, no new option. 300,000 nested rows, keys: ['id'], first read: Chromium 156 190 to 131 ms (0.69), Firefox 158 178 to 93 ms (0.52), WebKitGTK 2.52.6 110 to 103 ms (0.94). A full unpack without keys is level (0.96, 0.99, 0.90 as the first call).

### Details
Nested reader gets the wanted keys: top-level object rows build only those keys, in the order of the keys option, and skip other values by advancing the streams. Non-object rows, grouped and raw blocks keep the old projection. Round 60 patch; owner tapped 'Fix the keys option for nested'. Second keys read: 0.59 Chromium, 0.50 Firefox, 0.74 WebKitGTK. Note: a full unpack that comes after a keys read in the same page is no longer warmed by it (Firefox 86 to 129 ms), but it is still faster than a cold full unpack (142 ms), and the pair's total is smaller.

### Deep
lfc-pack 0.8.1: keys option on nested blocks builds only wanted keys. 300k nested rows (ids, names, nested pos, tags, ok), 9 paired fresh pages, keys:['id'] first read new/old: Chromium 156 0.69 (190 to 131 ms), Firefox 158 0.52 (178 to 93), WebKitGTK 2.52.6 0.94 (110 to 103); second read 0.59 / 0.50 / 0.74. Full unpack as first call (9-11 pairs): 0.96 / 0.99 / 0.90. Full unpack after keys reads: Chromium 0.99, Firefox 1.50 (86 to 129 ms; the old keys path had warmed the full builder; cold full is 142 ms), WebKitGTK 0.91. Node V8 (research): 172 to 77 ms. Output identical to 0.8.0 on a 480-case fuzz (random shapes incl. 30-shape blocks, nested values, range option) and the new test nestedkeys.cjs (144 key sets). Source: breakthroughs-2026.10.31/round60-nested-keys/.

## 0.8.0 · API 0 · 2026-11-08

### Quick
New LfcPack.packParallelStream(opts): push(bytes) as text arrives, await finish() for the file; same bytes as pack(). Blocks go to helper workers while later text is still being read. 99 MB of rows, 3 workers, text already in memory: Chromium 156 0.82, Firefox 158 0.70, WebKitGTK 2.52.6 1.09 of pack() time. No change to existing calls.

### Details
Cuts a block where pack cuts it (first line end at or after blockBytes), sends it to a pack helper at once (the existing helper pool, same helper messages as packParallel), keeps results in block order and joins them behind one footer with the same stitch as packParallel. One copy of each byte on the main thread; the block buffer is transferred to the helper. exact and share are refused. The caller may reuse its buffer after push. It pays on big inputs only: 33 MB gave 1.14 (Chromium), 0.97 (Firefox), 1.66 (WebKitGTK); 99 MB, 3 paired runs: 0.82, 0.70, 1.09 (4-core cloud box, text already in memory, so no parser overlap is counted).

### Deep
Requested by the owner (card 'Add LfcPack.packParallelStream()', Yes, add it, 11.08). Tests: test/pstream.cjs (8 piece-size cases, buffer reuse, two streams plus packParallel at once, refusals) and tests/lfc-pack-stream-browser.js.

## 0.7.2 · API 0 · 2026-11-08

### Quick
Fixes a bug in 0.7.1: the SIMD line counter dropped its 'non-ASCII bytes present' flag, so flat blocks with accents, emoji or other non-ASCII text could be written with wrong string offsets and then fail to read back (damaged block: not valid UTF-8). 0.7.0 and earlier were not affected. Upgrade from 0.7.1.

### Details
In flatscan.c count(), the SIMD loop set hi (a byte at or above 128 was seen), then the 8-byte loop that follows assigned hi again (hi = ...) and overwrote it. The caller then treated the input as ASCII and used byte offsets for strings. One character fix (hi |= ...). The no-SIMD build was not affected. New checks: test/nonascii.cjs (a non-ASCII character at every offset, SIMD and no-SIMD) and test/varlen-roundtrip.cjs (the Workbench probe).

### Deep
Bug found by the LFC Workbench thread with its variable-length string probe (repro-lfc-pack-0.7.1). Introduced by 0.7.1 (PR 642); I had checked output bytes on ASCII rows only. Lesson: run a non-ASCII round trip for any change to count() or the scanner.

## 0.7.1 · API 0 · 2026-11-08

### Quick
Flat-row packing is a few percent faster in all three browsers (WebAssembly line counter reads 16 bytes at a time, quicker string-dictionary lookups). Same file bytes, no API change. First pack of 100,000 5-column rows (8 MB): Chromium 0.95, Firefox 0.96, WebKitGTK 0.89; second pack 0.88, 1.00, 0.87.

### Details
flatscan.wasm now counts newlines, colons and commas with SIMD (flatscan-plain.wasm, the same code without it, loads when the browser has no SIMD, as core.wasm already does). The string dictionary hashes 4 to 16 byte values with two overlapping loads and keeps each value's offset and length inside its table slot, so a hit needs no second lookup. Node alone: line counter 0.94, hash 0.975, table 0.984, all three 0.86. 100,000 rows of id, name, city, date, score, fresh page, 15 paired runs, order alternated, median: first pack Chromium 156 99 to 94 ms (0.95), Firefox 158 84 to 81 (0.96), WebKitGTK 2.52.6 114 to 101 (0.89); second pack 53 to 47 (0.88), 54 to 54 (1.00), 54 to 47 (0.87). Output bytes identical in all runs (482,185) and with the SIMD probe forced off. The full file grows by about 22 KB (the second flat scanner); the decoder-only file does not.

### Deep
Requested by the owner (11.08): change the scanners for a performance gain. Profile (Node cpu profile, 32 MB of rows): string dictionary 19%, flat scanner 19%, zstd 9%, line counter 9% before this change (4% after). Tried alone and stacked; kept all three. Not changed: scanner (already word-at-a-time digits and predicted keys), number-column loops in JavaScript (about 17% together, next lead).

## 0.7.0 · API 0 · 2026-11-08

### Quick
Pack big files in several workers: packBlock(chunk) in each worker, pushPacked() on the main thread, same bytes as packStream.

### Details
New LfcPack.packBlock(chunk, opts) packs one chunk of whole lines on its own (any worker can run it; the result is plain bytes), and packStream().pushPacked(bytes) appends those chunks in text order. Chunks must be cut where push would cut them: at the first line end at or after blockBytes. The file is byte for byte the one push gives. share and exact are not supported for these calls (they throw). 33 MB, ms per pass, 2 workers vs push on the main thread: Chromium 182 vs 248, Firefox 170 vs 262, WebKitGTK 150 vs 248. One worker is slower than push (1.11-1.32x: copying and messages). Node, 83 MB: 2 workers 415 ms vs 650 ms.

### Deep
Requested by the owner for Workbench parallel pack workers.

## 0.6.2 · API 0 · 2026-11-07

### Quick
packStream.push no longer copies all the waiting text on every push: pieces are kept as pushed and joined once per block. 33 MB of JSON lines pushed in 16 KB pieces with 1 MB blocks: Chromium 0.35x, Firefox 0.62x, WebKitGTK 0.58x. 1 MB pushes: level (0.98-1.00). Same bytes.

### Details
push keeps a list of pieces; the line end past blockBytes is found by walking the pieces from where the last search stopped; only text that is still waiting after a push is copied, so a caller may reuse its buffer. Before, every push copied buf + bytes into a new array, which costs O(block size) per push (4 KB pushes with 2 MB blocks: 6x slower in Node).

### Deep
Faster packStream with small pushes.

## 0.6.1 · API 0 · 2026-11-07

### Quick
LfcPack.warm(): init plus a made-up 400-row pack and open in separate tasks, cached promise. First 20k-node save 0.85x Chromium, 0.97x Firefox, 0.66x WebKitGTK; first open 0.67-0.90x; 3k-node save 0.46-0.67x, open 0.43-0.85x. warm() itself 44-52 ms wall, no long task. Same bytes.

### Details
warm() returns one cached promise (true, or false if it cannot run; the decoder-only build resolves false). Each step runs in its own setTimeout task. Nothing changes unless a page calls it. Requested by the owner.

### Deep
Opt-in warm() for a faster first save and open.

## 0.6.0 · API 0 · 2026-11-07

### Quick
Opt-in lazy rows: open plus read one field of 300,000 rows in 26 ms (Chromium), 45 ms (Firefox), 29 ms (WebKitGTK); JSON.parse takes 168-214 ms.

### Details
Round 59 (module research). rows:'lazy' makes each row a small object holding its index under a symbol, with one getter per key on a per-block class (no generated code). rows:'lazycols' also decodes each column on first read. Dense flat blocks only; nested, sparse, toJSON or __proto__ keys give plain rows. Against plain rows (300k rows x 8 keys, median of 5): open + read 1 field Chromium 117 to 26 ms, Firefox 92 to 45, WebKitGTK 60 to 29; reading all 8 fields is level in Chromium (162 to 130) but slower in Firefox (86 to 155) and WebKitGTK (61 to 81), which is why it is opt-in. Default path unchanged. New test/lazyrows.cjs (30 checks); all lfc-pack checks pass.

### Deep
Opt-in lazy rows (rows: 'lazy' and 'lazycols'). Default unchanged. Rows are not plain objects: Object.keys, spread, structuredClone and postMessage lose the values.

## 0.5.9 · API 0 · 2026-11-07

### Quick
The reader from open() gives one block's columns and the footer's number ranges

### Details
R.columns(i, { keys }) returns block i as typed columns, the same entry unpackColumns gives, fetching only that block (its own reader, so arrays stay valid). R.zone(i, key) returns { min, max, count } of a number column from the footer, or null, so filters can skip blocks without decoding. Flat-row blocks only; nested and raw blocks throw with a pointer to block(i). Asked for by the LFC Workbench (per-block memory, block skipping).

### Deep
Requested by the owner (Workbench brief, 2026.11.07).

## 0.5.8 · API 0 · 2026-11-07

### Quick
Firefox: first two big reads 0.93 and 0.80 of the time, warm reads 0.91

### Details
Firefox built each IPv4 text from four pieces, leaving two throwaway pieces per address. That garbage kept Firefox from learning to place lfc-pack's values straight into long-lived memory, so the first reads of a page paid 25 to 35 ms of young-memory copying each, more after a small read. Firefox now builds the addresses like WebKit does (one text, then slices). Cloud Firefox 158, 100k log rows, 12 fresh pages: reads 1-2 80, 79 -> 74, 63 ms; after small reads 72, 80 -> 69, 61 ms; warm 47 -> 43 ms. Same values; Chromium and WebKit unchanged.

### Deep
Requested by the owner (card: Dig for a real fix).

## 0.5.7 · API 0 · 2026-11-06

### Quick
Same output, 718 bytes smaller tokenizer program

### Details
The tokenizer keeps its counters in WebAssembly globals instead of memory: same bytes out, same speed, core.wasm 16,822 to 16,104 bytes.

### Deep
Requested by the owner (card: Ship them).

## 0.5.6 · API 0 · 2026-11-06

### Quick
pack() no longer throws RangeError when one row's shape outgrows the 1 MB shape buffer; that row is stored whole as text. Same bytes for every other input.

### Details
Before: pack('[...30,000 objects...]') threw 'offset is out of bounds' (Uint8Array.set in shred). Now the row is stored raw (like rows nested deeper than the limit): values and exact text read back the same. A 7.8 MB one-array document packs to 928 KB. Other inputs: same packed bytes (checked on 100,000 log rows in 3 browsers).

### Deep
Found while testing the PPMd 'WebAssembly globals' idea on lfc-pack's tokenizer (that idea gave no measurable change and was not shipped). A JSON text whose top level is one big array is one row; its shape key (JSON of the walked structure) grew past the 1 MB SK buffer, and v.SK.set threw RangeError: offset is out of bounds at about 30,000 items. Fix in src/shred.js: when the encoded shape is larger than the buffer, the text, number and side-string positions are rolled back and the row is kept raw (putStr(line), shape '5'), the same path as rows nested too deep. New test test/bigdoc.cjs (1,000 and 40,000 items plus a small row, values and exact text); it fails on 0.5.5 and passes now. All lfc-pack checks pass. Packed bytes of 100,000 log rows are the same before and after in Chromium 155, Firefox 158 and WebKitGTK 2.52.6.

## 0.5.5 · API 0 · 2026-11-06

### Quick
writeFlatBlock stripped trailing newlines with /\n+$/, which the engine retries from every newline of a run: quadratic on a long run of blank lines (80,000 took 5 s; a megabyte would take minutes).

### Deep
writeFlatBlock stripped trailing newlines with /\n+$/, which the engine retries from every newline of a run: quadratic on a long run of blank lines (80,000 took 5 s; a megabyte would take minutes). Now trimmed by hand from the end. Same output. Found by the regex sweep that followed zip-open 1.19.1.

## 0.5.4 · API 0 · 2026-11-06

### Quick
The probe timed 3 ways of making row objects on 8,192 rows, 3 rounds, on the first big dense block of each key count: 30 to 90 ms per key count, and its pick flipped between runs below 16 keys.

### Deep
The probe timed 3 ways of making row objects on 8,192 rows, 3 rounds, on the first big dense block of each key count: 30 to 90 ms per key count, and its pick flipped between runs below 16 keys. Now: clone from 16 keys, plain under that. Fresh page reading 30,000-row sets with 3, 7, 15, 24 and 40 keys once each, 3 runs per browser: Chromium 399-440 -> 123-134 ms, Firefox 387-443 -> 136-162 ms, WebKitGTK 270-292 -> 131-141 ms. Later reads the same or slightly faster. Same rows; round trips value-exact in all 3 browsers.

## 0.5.3 · API 0 · 2026-11-06

### Quick
Firefox (Gecko) only: IP text is joined from four short pieces (one flat string there) instead of writing digits and cutting them out of one decoded text.

### Deep
Firefox (Gecko) only: IP text is joined from four short pieces (one flat string there) instead of writing digits and cutting them out of one decoded text. Phase timing in Firefox, 300,000 log rows: IP column 27 ms of about 190 ms. One-lib-per-page runs, 4 each: unpack 152-163 ms vs 167-196 ms (about 0.87x). Hex ids joined the same way were 1.4x slower and were dropped. Chromium and WebKitGTK unchanged. Round trips value-exact in all 3 browsers.

## 0.5.2 · API 0 · 2026-11-06

### Quick
Chromium (V8) only.

### Deep
Chromium (V8) only. Dense block with a known clone choice: each column is decoded, assigned down the rows and dropped, so fewer column arrays are live at young-generation collections. IP column digits from a 256-entry table. Cloud Chromium 155, 300,000 log rows, in-page interleaved A/B, 9 runs: unpack 0.93x median (8 of 9 faster); each idea alone about 0.97-1.0x. Firefox showed no gain, so Firefox and WebKitGTK keep the old path. Same rows on all test sets.

## 0.5.1 · API 0 · 2026-11-05

### Quick
One-call use (requested by the owner): pack, packRows, packTables, unpack, unpackRows, unpackText, unpackTables, unpackColumns, info, stats and metadata start the WebAssembly parts themselves on the first call (the reader alone for read ca…

### Deep
One-call use (requested by the owner): pack, packRows, packTables, unpack, unpackRows, unpackText, unpackTables, unpackColumns, info, stats and metadata start the WebAssembly parts themselves on the first call (the reader alone for read calls). Calling init() first still works and is still the way to start early. No change to bytes or speed.

## 0.5.0 · API 0 · 2026-11-05

### Quick
LfcPack.open(src) takes a File, Blob, a read(offset, length) function with .size, or bytes.

### Deep
LfcPack.open(src) takes a File, Blob, a read(offset, length) function with .size, or bytes. It reads the trailer and footer only; rows({from, count, table}) and block(i) fetch only the blocks they need, checked against their checksums, and give the same rows as unpackRows. Memory is bounded by the footer plus one block. No format change. Files with raw blocks (exact mode on text that is not plain rows) are read whole on first use. Requested for the LFC Workbench data view.

## 0.4.24 · API 0 · 2026-11-05

### Quick
packTables and packRows build their row text from one JSON.stringify of each array instead of one per row; same bytes, no API change.

### Details
20,000-item Netflow map (bigNetwork(20000,4,7), nodes and links tables) through packTables, medians of 7 to 11 browser launches per run, one library per launch, 2 to 4 runs: Firefox 158 first pack 0.82-0.93x, warmed 0.68-0.89x; ungoogled Chromium 155 first 0.83-0.95x, warmed 0.86-0.97x; WebKitGTK 2.52.6 first 0.97-1.05x, warmed 0.87-1.02x (no change beyond noise). Files byte-identical. Adds rowscan.wasm (263 bytes); lfc-pack.js grows by about 3 KB. No extra memory is held: the text is encoded into the tokenizer's input buffer.

### Deep
packTables and packRows used to stringify every row on its own and join the strings with line ends (80,000 small strings for a 20,000-item Netflow map). They now call JSON.stringify once per array, encode the text straight into the tokenizer's input buffer (memory the pack touches next anyway, at most as far as one block would grow it; bigger tables fall back to a JS scan), and a 263-byte wasm function (wasm/rowscan.c, imports the tokenizer's memory) turns the array's top-level commas and closing bracket into line ends. The bytes are the same as before; rows JSON.stringify writes differently inside an array (undefined, functions, symbols, a toJSON method) keep the per-row path. Checked byte-identical against 0.4.23 on 26 files (the Netflow map, edge cases with quotes, backslashes, brackets inside strings, non-ASCII, empty tables, a 300,000-row table, after a memory trim, and 12 random files of escape-heavy strings). Tried and dropped: the scan in plain JS (Firefox gained, Chromium and WebKitGTK flat), a JS scan that hops over strings with indexOf (slower everywhere), the wasm scan in 256 KB calls (same as one call). Stage split of the first pack (Netflow map): about half of the gap to a warmed pack is engine warm-up and half grows with job size (first-touch memory and JIT in the tokenizer, string dedupe, zstd and the writer); a small warm-up pack removes only the first half.

## 0.4.23 · API 0 · 2026-11-05

### Quick
Auto mode now starts with the template read check marked failed (tmplSlow = true), so the timed check (115-155 ms of every first logs/events pack) no longer runs.

### Deep
Auto mode now starts with the template read check marked failed (tmplSlow = true), so the timed check (115-155 ms of every first logs/events pack) no longer runs. It failed on every column measured: template reads 1.3-4.3x slower than the plain layout in Chromium, Firefox, WebKitGTK and Node. Templates stay available with { templates: true }. Byte-identical files on 12 set/option pairs and 600 random files. First pack, one library per launch: Firefox logs 0.50, events 0.64; WebKitGTK logs 0.49, escaped logs 0.57, events 0.55; Chromium no clear change. From branch claude/project-thread-cahtub commit f9b4cc5c (owner tapped Yes, ship it, 2:18 AM ET 11.05).

## 0.4.22 · API 0 · 2026-11-05

### Quick
Round 46 follow-up (cause, not warm-up).

### Deep
Round 46 follow-up (cause, not warm-up). decodeColumn held every column kind's loops in one big function; on a page's first open each hot loop made Chromium rebuild optimized code for the whole function (hex id column 88 ms on the first open, 7 ms later). Each kind (V, B, T, D, H, U, I) now has its own small function; the hex column writes two letters per step through a 256-entry Uint16 table. Medians of fresh pages, first unpack, ms: logs 100k Chromium 266 -> 176 (0.66), Firefox 235 -> 227 (0.97), WebKitGTK 167 -> 170 (about even); logs 6k Chromium 46 -> 48 (noise); events 50k (nested) Chromium 115 -> 110, Firefox 90 -> 81, WebKitGTK 103 -> 92. Remaining first-open extra in Chromium: probeClone (25-30 ms, one time) and frame decoding (+15 ms).

## 0.4.21 · API 0 · 2026-11-05

### Quick
flatscan.c strdict(): the two all-values loops wrote the NUL separator when output bytes existed (if(o)) instead of for every value after the first (if(i)), so leading empty strings in a text column were dropped and later values moved up a…

### Deep
flatscan.c strdict(): the two all-values loops wrote the NUL separator when output bytes existed (if(o)) instead of for every value after the first (if(i)), so leading empty strings in a text column were dropped and later values moved up a row. Fixed both loops; flatscan.wasm rebuilt with clang 18.1.3 (new wasm/build-flatscan.sh reproduces the committed flatscan.wasm and tpl4.wasm byte for byte). New test/emptystr.cjs (bad 29 on 0.4.20, bad 0 now). Nested blocks were never affected. Files from 0.4.15-0.4.20 with leading empty strings stay as written.

## 0.4.20 · API 0 · 2026-11-05

### Quick
Two commits from the LFCP thread (owner's card 'Yes, ship it', 1:39 AM ET 11.05).

### Deep
Two commits from the LFCP thread (owner's card 'Yes, ship it', 1:39 AM ET 11.05). Round 43 (a32fcc04): probeClone in src/flat.js times the row-building ways on 8,192 rows, not the whole block; cold first open 0.27-0.68x of the old time, output identical. Round 44 (7f635a60): tokenizer buffers laid out per block from counted quotes, separators and line ends instead of a fixed 384 MB initial memory (wasm/core.c, build-core.sh, src/shred.js, rebuilt wasm); 20,000-item Netflow map 384 MB -> 66 MB, geo 141 MB, orders 146 MB; byte-identical on 2,700 random files and 108 edge cases; warmed pack WebKit 0.92-1.01x, Chromium events 0.46x, Firefox 0.94-1.03x (orders recheck 12 rounds 1.031x, within noise). Details: js-modules-research/lfc-pack/stack-retest-2026.10.31/RESULTS-share-paths-2026.11.01.md, rounds 43 and 44. All lfc-pack checks pass. Requested by the owner.

## 0.4.19 · API 0 · 2026-11-01

### Quick
unpackText encodes 1,024 rows at a time instead of one row at a time (round 42, research thread).

### Deep
unpackText encodes 1,024 rows at a time instead of one row at a time (round 42, research thread). Fast writer: number and list passes as small functions (Firefox reaches full speed sooner); scan and count in 256 KB wasm calls (LFCP thread). Same bytes on every case. Laptop (new/old, lower is better): Chromium 156 first pack in a fresh page logs 0.978, events 0.984, sensor 0.712; unpackText logs 0.457, events 0.545, escaped logs 0.499. Firefox 160 first pack 0.982 / 0.971 / 0.640; unpackText 0.577 / 0.707 / 0.618. Cloud WebKitGTK first pack 0.962 / 0.928 (inconclusive) / 0.940; unpackText 0.880 / 1.004 / 0.858.

## 0.4.18 · API 0 · 2026-11-01

### Quick
Fast writer: each text column parsed as one JSON array; text-column scratch laid out only when a block has text, and smaller; a compression candidate stops once it cannot win; IPv4 tried before the string dictionary pass; the dictionary pa…

### Deep
Fast writer: each text column parsed as one JSON array; text-column scratch laid out only when a block has text, and smaller; a compression candidate stops once it cannot win; IPv4 tried before the string dictionary pass; the dictionary pass reads per-column cell lists and stores hashes. Same output bytes on every laptop and phone case. Laptop Firefox 160: escaped logs 0.738, sensor 0.924, logs 1.044 (inconclusive). Android Chrome 156: logs 0.899, nothing slower. Laptop Chromium 156: all same or faster. Cloud WebKitGTK judged with one library per page (owner's card): 0.995, 0.936, 1.009; two libraries sharing one heap swing 240-800 ms for both versions alike.

## 0.4.17 · API 0 · 2026-11-01

### Quick
From the LFCP thread (branch claude/project-thread-cahtub, head 1bc45c0).

### Deep
From the LFCP thread (branch claude/project-thread-cahtub, head 1bc45c0). Object keys hashed and copied to the skeleton in one pass (core.wasm, 56caf06); number digits read 8 at a time (f957a46); many-value text columns skip encodeColumn's dictionary pass (3dc5de4); log templates are no longer built once the read check has failed (91d6e7b); the timed template read check runs at most once per column key per session on both writers (386a746, 84b0ead) - before, writeFlatBlock re-ran it (>=48 ms) on every block; IPv4 and many-value text columns built straight from the bytes (3e9a8a9); the fast flat writer takes strings with escapes (6ca4acf, owner tapped 'Yes, ship it' 2026.11.01 12:17 AM ET: escaped-log files 2,144,898 to 2,143,966 bytes at default blocks and 2,248,565 to 2,244,046 at 256 KB, round trips exact); TypedArray constructors, a cheap int32 test in colKind and a Float64Array from scaledInts (d1e697f, 5a931ff, 6d8ef36). Laptop Firefox 160 (16 cores), pack time vs 0.4.15: logs 0.329 / 0.339 (default / 256 KB), escaped logs 0.237 / 0.021, events 1.000 (ok); orders 0.983, orders 256 KB 0.971, map points 0.946 (with 91d6e7b). Cloud Chromium 155 smoke: logs 0.478 / 0.387, escaped 0.358 / 0.031, events 1.015 (inconclusive). Byte-identical to 0.4.16 on 1,900 of 1,900 fuzz files and all test generators except gen.logsEscaped. Tests pass.

## 0.4.16 · API 0 · 2026-11-01

### Quick
From the LFCP thread's patch (bitunpack-tail.diff).

### Deep
From the LFCP thread's patch (bitunpack-tail.diff). bitunpack's hot loop read up to 3 bytes past the end of b for the last values; Firefox handles out-of-range typed-array reads slowly. Now the values whose 4-byte window fits run first, then a guarded tail loop (b[i] | 0). Phase timers (LFCP thread, Firefox): bitunpack 10 to 5 ms on events, 7 to 3 ms on escaped logs. Whole unpack, early-stop A/B in cloud browsers: Firefox 158 events 0.725 (noisy, ok), escaped logs 0.980 (ok); Chromium 155 0.907 and 0.953 (ok; a first run gave 1.031 inconclusive on escaped logs); WebKitGTK 2.52.6 1.030 and 0.949 (ok). Same rows in all 3. Fuzz: old and new bitunpack equal on 8,520 cases (widths 1 to 24, 0 to 70 values, exact and padded buffers). Tests pass.

## 0.4.15 · API 0 · 2026-10-31

### Quick
LFCP-thread changes ab16b9b (strdict: few-value string columns built in flatscan.wasm straight from ASCII input bytes), 3af552f (gather: per-key counts and number columns in wasm) and dc1b131 (slotScan: one hand-written pass for log templa…

### Deep
LFCP-thread changes ab16b9b (strdict: few-value string columns built in flatscan.wasm straight from ASCII input bytes), 3af552f (gather: per-key counts and number columns in wasm) and dc1b131 (slotScan: one hand-written pass for log template slots, matches RX_SLOT on 300,000 random strings). Byte-identical on 15 of 15 files plus edge cases. Laptop pack time vs 0.4.14, early-stop A/B: Firefox 160 events 0.798 (default) / 0.857 (256 KB), logs 0.842, sensor 0.929; Chromium 156 events 0.746 / 0.820, logs 0.900, sensor 0.849. Cloud WebKitGTK events 0.977 / 1.010, logs 0.877.

## 0.4.14 · API 0 · 2026-10-31

### Quick
Two LFCP-thread changes.

### Deep
Two LFCP-thread changes. 68f4067: log template slots keep hex ids whole (RX_SLOT in src/flat.js). Laptop pack time vs 0.4.12: Firefox 160 logs 0.860 / 0.879 (256 KB), events 0.989; Chromium 156 logs 0.875 / 0.902, events 0.994; cloud WebKitGTK 0.95. 770a129 (on c69665c): with ASCII input, lowercase hex id string columns of one even length of 16 or more are checked and packed inside flatscan.wasm (new export hexcols()) straight from the input bytes, so no JS strings are made. Laptop Firefox 160, B/A: events default 0.655, events 256 KB 0.838, logs 0.993, sensor 1.017; Chromium 156 events 0.821 / 0.866, logs 1.018, sensor 0.927; cloud WebKitGTK flat. Byte-identical output on 15 of 15 files plus non-ASCII and mixed edge cases.

## 0.4.13 · API 0 · 2026-10-31

### Quick
The four wasm modules are stored as base64 of [u32 size][raw deflate level 9].

### Deep
The four wasm modules are stored as base64 of [u32 size][raw deflate level 9]. In a browser they are unpacked with DecompressionStream('deflate-raw') streamed into WebAssembly.instantiateStreaming, so unpacking overlaps compiling. Fallbacks: Node zlib, then a small JS inflater, then raw wasm when the magic bytes match. lfc-pack-read.js keeps plain base64. Load to first result, new / old: laptop Chromium 156 0.899 and 0.893, laptop Firefox 160 0.968 (one earlier Firefox run hit an out-of-memory error in a frame; it did not repeat on take 2, which also retries and names the side); cloud Chromium 0.947/0.923, Firefox 0.908, WebKitGTK 0.966. Same files. New test/inflate.cjs covers the zlib and JS inflater paths.

## 0.4.12 · API 0 · 2026-10-31

### Quick
flatscan: keys tried in the last row's order first (faca024) and number digits 8 at a time (d2cc168), LFCP thread; byte-identical files.

### Deep
flatscan: keys tried in the last row's order first (faca024) and number digits 8 at a time (d2cc168), LFCP thread; byte-identical files. Laptop (lfc-scanner-stack, E vs 0.4.10, includes 0.4.11's C): Chromium 156 sensor default 0.840, sensor 256 KB 0.844, events 0.876; Firefox 160 0.857, 0.853, 0.918. Cloud WebKitGTK step ratios D vs C 0.881/0.898/1.000, E vs D within noise.

## 0.4.11 · API 0 · 2026-10-31

### Quick
flatscan count() reads 8 bytes at a time (LFCP thread, f5687b3), 2.6-4.8x faster sizing pass, byte-identical files.

### Deep
flatscan count() reads 8 bytes at a time (LFCP thread, f5687b3), 2.6-4.8x faster sizing pass, byte-identical files. Laptop (lfc-decimals-recheck, ratio vs 0.4.9, C = 0.4.10 + this): Chromium 156 sensor 256 KB 0.915, events 0.932; Firefox 160 0.718 and 0.895. Cloud WebKitGTK vs flat9: 0.97-1.02.

## 0.4.10 · API 0 · 2026-10-31

### Quick
Fast flat writer handles numbers with up to 9 decimals (flat9, LFCP thread, branch claude/project-thread-cahtub 737a95c).

### Deep
Fast flat writer handles numbers with up to 9 decimals (flat9, LFCP thread, branch claude/project-thread-cahtub 737a95c). Files byte-identical with 0.4.9. Laptop recheck, ratio new/0.4.9: Chromium 156 sensor 256 KB blocks 1.023 (0.995-1.048) ok, events default 0.968 ok; Firefox 160 sensor 256 KB 0.792 faster, events 0.995 ok (noisy). Earlier laptop: Firefox sensor default 0.712, Chromium 0.732. Cloud WebKitGTK 2.52.6: sensor 256 KB 0.640, events 0.859.

## 0.4.9 · API 0 · 2026-10-31

### Quick
decodeDecimalColumn keeps a plain running sum when the column's delta step is 1 (k = 1) instead of a one-slot ring array; num_group in core.wasm writes dense path ids in place (2.5 MB less scratch per pack). Rows and files unchanged, no API change.

### Details
Laptop open, new/old: Firefox 160 geo 0.918 faster, sensor 0.952 ok, orders 1.048 inconclusive; Chromium 156 geo 0.997, sensor 1.008, orders 1.091 inconclusive (noisy). num_group writes each number's dense path id over its path hash in NUMP (no NUMI region at DDOUT+32 MB); on more than 32,768 paths it restores the hashes for the JS fallback (test/manypaths.cjs). Laptop pack, new/old (orders / geo / sensor): Firefox 160 1.031 / 0.984 / 1.045, Chromium 156 0.991 / 0.996 / 1.006, all ok or inconclusive.

### Deep
From the LFCP thread (branch claude/project-thread-cahtub, commits dde3d86 and 5aa6a87, cherry-picked; 5f26288 flat decimals left out pending its laptop run). Owner's cards in that thread: 'Ship it' on the decimal reader and 'Ship it' on in-place number ids (2026.10.31 8:41 PM ET). core.wasm and core-plain.wasm rebuilt from core.c byte-identical to the branch's. Laptop page: js-modules-research/laptop-round-2026.10.31/lfc-read-pack-check.html.

## 0.4.8 · API 0 · 2026-10-31

### Quick
Reads reuse one kept buffer for unpacked pieces; held up to 4 s after the last read and dropped by trim(). Old code needs no change.

### Details
Laptop (16 cores), new/old open time: FHIR 48 MB Chromium 156 0.942 and 0.995 (two runs), Firefox 160 0.896; logs 0.940 and 0.976 / 1.000 (inconclusive); events 0.989 and 0.972 (noisy) / 1.000. Cloud WebKitGTK 2.52.6: FHIR 0.868, logs 0.865, events 1.000. Held memory: 1.25x the largest block's unpacked pieces (3.7 MB for the FHIR slice).

### Deep
Each piece was unpacked into wasm memory and copied out into fresh memory (FHIR 48 MB slice: 145 copies, 10.9 MB per open; copy time swung 4-56 ms run to run). Main-thread reads (unpack, keys/range, unpackRows, unpackText) now put a block's pieces into one kept ArrayBuffer at 8-byte steps; rows never point into pieces (test/arena.cjs). Helpers, unpackColumns and raw blocks keep owned copies. Also fixed: flat.js read row-order ids at byte offset 0. Variant dropping the buffer right after each open: never better, events up to 1.41x slower; dropped. Two-libraries-on-one-page cloud A/B had a 6-13% order bias here; numbers above use one library per page or one frame per build. Owner's card: see thread.

## 0.4.7 · API 0 · 2026-10-31

### Quick
Fix, no API change: warmPack(n) keeps n helpers even when some were already idle (it kept fewer), its idle list can no longer drop or repeat helpers a packParallel call took meanwhile, and a failed call no longer leaves other idle helpers without their closing clock. Old code needs no change.

### Deep
Found while checking every helper pool for idle-close timers that overlapping calls could orphan (zip-open 1.10.0 finding, PR 356). packParallel itself was safe: only idle helpers are ever in the closing list. Two bugs in src/pool.js: (1) warmPack(n) made its helpers with takeHelper(), which pops idle helpers first, so with m idle it started n-2m new ones at most (warmPack(4) after one 2-helper call kept 2), and it then set the idle list to a snapshot taken before the wait, which could drop or re-add helpers a call took or gave back meanwhile; now it makes new helpers only and appends them to the list as it is when they are ready, and kills them if one fails to start. (2) a failed packParallel run killed its own helpers but did not restart the closing clock, so helpers other calls had left idle stayed alive; release now always re-arms (armIdle). New checks: test/overlap.cjs (Node) and an overlap section in tests/lfc-pack-parallel-browser.js (3 browsers); 0.4.6 fails both on the warmPack count. Not timed: the packing path is unchanged.

## 0.4.6 · API 0 · 2026-10-31

### Quick
Each big nested block now picks its string layout by itself: per-path strings unless the text they would store twice is over 11% of the block's text.

### Details
The per-block layout rule (was opt-in as paths: 'auto') is now the default. Real FHIR, 260 MB: 8,323,554 to 7,304,811 bytes (12% smaller); 48 MB: 1,606,003 to 1,505,314 (6%). Reading the 260 MB file, new/old time (lower is better): Chromium 153 0.871, Firefox 158 0.857, WebKitGTK 2.52.6 0.780. Packing vs 0.4.5 on the laptop: Firefox 160 all six cases ok (0.977 to 1.035), Chromium 156 all ok (1.008 to 1.026; FHIR with 4 helpers ok on recheck, 1.006). Orders, GeoJSON and many-path made-up data: same bytes. pack and packParallel write the same bytes. paths: false and paths: 'only' work as before.

### Deep
Per-block string layout rule on by default: FHIR 6-12% smaller, reads 13 to 22% faster; packing within 5% everywhere (laptop Chromium 156 and Firefox 160). Owner picked 'Laptop check, then default' and 'Fix helper case first' (the helper fix shipped as 0.4.5).

## 0.4.5 · API 0 · 2026-10-31

### Quick
Helpers no longer give back their packing memory right after each call; they keep it until they close, 3 s after the last call.

### Details
Before, pool.js trimmed each helper's packer memory as soon as a packParallel call finished, so the next call grew it again and touched every fresh page. Now helpers keep it until they close 3 s after the last call (test hook _helperTrimMs). 48 MB of Synthea FHIR, 2 helpers, new/old time (lower is better): default layout Chromium 153 0.846, Firefox 158 0.751, WebKitGTK 2.52.6 0.931; paths: 'auto' vs old default 0.907 / 0.930 / 0.907. Node back-to-back, 4 helpers: 168 to 115 ms. Same bytes.

### Deep
packParallel helpers keep their packer memory until they close (3 s after the last call) instead of trimming after every call: 7 to 25% faster on 48 MB FHIR with 2 helpers. Approved by the owner (card, 2026.10.31 6:11 PM ET). Idle helpers hold that memory up to 3 s longer.

## 0.4.4 · API 0 · 2026-10-31

### Quick
The string path hashes of each row shape are kept across blocks (up to 65,536 shapes), so per-path strings stop re-walking every shape in every block. Files are byte-identical; no API change.

### Details
260 MB of real FHIR, one thread, new/old (lower is better): Chromium 0.86, Firefox 0.85, WebKitGTK 0.90 (with the per-path rule build; this build with 4 helpers 0.92 / 0.91 / 0.92). orders x5 one thread: 0.94 / 1.01 / 1.01. GeoJSON 256 KB blocks: Chromium 0.93, Firefox 0.99, WebKitGTK 1.03 inconclusive, rechecked 1.13 slower then 0.96 ok (80 ms packs on a noisy box). Bytes checked identical on orders, GeoJSON and FHIR.

### Deep
Found while profiling the FHIR layout rule: pathOrder() called stringPaths() and FNV-hashed every path of every shape in every block; FHIR has hundreds of shapes per block, so this was about 20 ms of a 100 ms block. Cache: Map from shape string to its path hashes, cleared above 65,536 entries. Research: js-modules-research/lfc-pack/fhir-rerun-2026.10.31/PATHS-PICK.md.

## 0.4.3 · API 0 · 2026-10-31

### Quick
Idle auto-trim: 30 s after the last pack, packRows, packTables or packStream chunk, the packer's wasm instance is replaced (trimPacker()). The zstd memory stays. Files are unchanged, and there is no API change.

### Details
packMany() clears any pending idle timer, packs, then arms a 30 s setTimeout (unref'd in Node, so it never keeps a process alive). trim() and trimPacker() cancel a pending timer. _autoTrimMs(ms) is an internal test hook (test/trim.cjs uses 5 ms). First pack after an idle trim (3.7 s idle, 66.6 MB, after / no trim): laptop Chromium 156 0.984 [0.968, 0.999] ok; laptop Firefox 160 1.017 [0.984, 1.021] ok; cloud WebKitGTK 2.52.6 1.056 [0.995, 1.134] inconclusive, from fresh pages, which the 30 s wait limits to packs after long pauses.

### Deep
Owner picked 30 s on a card (2026.10.31 3:39 PM ET). The Linux page map shows a 66.6 MB pack writes 38.1 MB of the core's 384 MB, which is what an idle trim gives back; big blocks touch more (input, text and the dedupe output are each up to 48 MB). See 0.4.2 for why the shredder is rebound rather than rebuilt. Change by the LFC-pack spec thread (09f3b5b).

## 0.4.2 · API 0 · 2026-10-31

### Quick
`trimPacker()` (used by `trim()` and by idle `packParallel` helpers) now rebinds the existing shredder to the new core instance instead of building a new one. The first pack after a trim is no longer slower. Files are unchanged, and there is no API change.

### Details
`makeShredder()` returns `rebind(instance)`, which rebuilds the typed-array views over the new instance's memory and updates `x` and `mem`. The shredder functions themselves stay the same, so the engine keeps their optimized code. Before this, every trim created new closures, and the next pack ran on re-warming code. Measured on the first pack after 3.7 s idle (66.6 MB, early-stop A/B, after / no trim):

| Browser | trim, rebuild shredder (0.4.1) | trim + rebind |
|---|---|---|
| Laptop Chromium 156 | 1.042 [1.019, 1.057] inconclusive | 0.984 [0.968, 0.999] ok |
| Laptop Firefox 160 | 1.015 [0.992, 1.064] inconclusive | 1.017 [0.984, 1.021] ok |
| Cloud Chromium 155 | 1.060 [0.933, 1.133] noisy | 0.941 [0.868, 1.035] ok |
| Cloud WebKitGTK 2.52.6 | n/a | 1.056 [0.995, 1.134] inconclusive (vs rebuild: 1.019 [0.960, 1.035] ok) |

Deep: The Linux page map of the Firefox content process shows that a 66.6 MB pack writes only 38.1 MB of the core's 384 MB, in 13 runs: the input copy, text, numbers, the number-grouping scratch and the dedupe table. Huge pages are not used. So a trim frees about 38 MB here, and the next pack faults those pages back in: about 27 ms at 0.7 ms per MB, or about 1% of the pack. Faulting cost 10 ms per MB on a busy cloud box, which explains an earlier +16% result there.

What was tried:
- Refilling exactly those pages in idle came out 1.080, noisy. It also gives the memory back, so it was dropped.
- Touching all of the new memory in idle (cloud Chromium 0.871 ok) also gives the memory back.
- `WebAssembly.Memory.prototype.discard` is in none of the three test browsers.

### Deep
trim() rebinds the shredder instead of rebuilding it: first pack after a trim, laptop Chromium 1.042 to 0.984 of no-trim time, Firefox 1.015 to 1.017; files byte-identical.

## 0.4.1 · API 0 · 2026-10-31

### Quick
Row shapes are found faster in wasm (last row first, 8-byte compare, faster hash); packs 6-29% faster, files unchanged, no API change.

### Details
A Chromium profile of pack put `shapeFor` (wasm/core.c) at 11 to 14% of the time. It hashed every row's shape with byte-wise 64-bit FNV, then compared it byte by byte. Three changes were tried alone and together: try the previous row's shape first (SF_LAST), compare 8 bytes at a time (SF_WORDS), and hash 8 bytes per step (SF_FASTHASH). Their profile shares were 10.2%, 7.9% and 6.3% alone, and 2.1 to 3.3% together, so all three are on. Shape ids are still given in first-seen order, so the files are byte-identical (1,616 packs).

Early-stop A/B (qa-guide/ab-sequential), pack time after / before, with the 90% range, 100,000 rows:

| Browser | orders default | orders 256 KB | geo default | geo 256 KB |
|---|---|---|---|---|
| Chromium 155 | 0.770 [0.695, 0.883] faster | 0.726 [0.581, 0.926] faster | 0.829 [0.749, 0.905] faster | 0.832 [0.633, 1.009] ok |
| Firefox 158 | 0.711 [0.502, 1.008] ok | 0.798 [0.667, 0.927] faster | 0.783 [0.711, 0.928] faster | 0.874 [0.774, 1.042] ok (rerun; first run 0.953, inconclusive) |
| WebKitGTK 2.52.6 | 0.911 [0.798, 0.946] faster | 0.930 [0.753, 1.028] ok | 1.011 [0.665, 1.043] ok | 0.939 [0.865, 1.064] inconclusive, noisy (twice) |

Also tried, no gain in the profile, so dropped: in the JSON parser, a duplicate-key hash shared with the path hash, a 16-byte key scan, and a bulk key copy into the skeleton.

Laptop (16 cores), same A/B: Chromium 156 orders 0.867, orders 256 KB 0.939, geo 0.786, geo 256 KB 0.869; Firefox 160 (two runs) orders 0.918/0.881, orders 256 KB 0.896/0.930, geo 0.810/0.827, geo 256 KB 0.896/0.876. Real FHIR 260 MB (cloud): Chromium 153 0.959, Firefox 158 0.926, WebKitGTK 0.990. Files byte-identical everywhere.

### Deep
Row-shape lookup in wasm: pack 6-29% faster in Chromium and Firefox (laptop 6-21%), WebKitGTK within noise; real FHIR 260 MB 4-7% faster; files byte-identical.

## 0.4.0 · API 0 · 2026-10-31

### Quick
Per-path strings on by default (paths:false off); share:true shared string/shape tables; access:'random' preset; trim(); idle pack helpers free memory; numbers grouped by path in wasm.

### Details
Nested blocks keep strings per string path by default (sp:1, LAYOUT-SPEC 3.5a): GeoJSON 100k points -11% at default blocks, -14% at 256 KB; orders -6%/-5%; older readers refuse such blocks; each block keeps the smaller layout. share:true (footer section 16, g:1, sp:2) -12 to -22% at small blocks. access:'random' = 256 KB blocks + share; 100-row reads 20-60x faster than 13 MB blocks, files 4-10% larger. trim() frees 80-90 MB after a 66.6 MB job in 2-24 ms (no idle auto-trim, by the owner's pick). Idle packParallel helpers free 200-350 MB (Chromium, Firefox) and about 1.1 GB (WebKitGTK). Number grouping in wasm: pack 3-25% faster, same bytes. String/shape tables cleared only as far as used (small-block packs 1.3-3.7x faster). Readers refuse short H/U/I frames.

### Deep
Per-path strings by default, share and access:'random' options, trim(), lower helper memory, faster packing.


### Details (number grouping)
`shred()` grouped the numbers of a nested block by path with two JavaScript Map lookups per number. The path hashes are 32-bit, which are slow as Map keys. On its own that loop took about 60 ns per number in all three browsers (2,000,000 numbers in 96 to 143 ms). A direct-mapped cache in front of the Map was slower still (132 to 194 ms), so it was dropped.

The new export `num_group` (wasm/core.c) does the grouping inside the module. It gives each path a dense id in first-seen order (an open-addressing table that is cleared only where it was used), then does a stable counting sort. JavaScript then takes each column as one `slice`, so column order and value order are unchanged and the files are byte-identical (5,913 packs: fuzz sources plus 4 data sets x 6 option sets). The scratch space is DDOUT, which is free until `dd_run`, so the module's memory does not grow. With more than 32,768 number paths in a block, it falls back to the JavaScript loop (test/manypaths.cjs).

Pack ms, before / after, median of 7, two rounds (first and second number per cell):

| Browser | orders 256 KB | orders default | geo 256 KB | geo default |
|---|---|---|---|---|
| Chromium 155 | 633, 528 / 475, 426 | 369, 348 / 310, 271 | 298, 246 / 270, 215 | 170, 205 / 141, 142 |
| Firefox 158 | 636, 531 / 505, 526 | 391, 359 / 340, 384 | 321, 251 / 285, 261 | 262, 204 / 182, 177 |
| WebKitGTK 2.52.6 | 553, 510 / 498, 455 | 405, 416 / 357, 330 | 288, 346 / 278, 228 | 235, 201 / 167, 165 |

Also tried: reading decimal columns straight from the zstd output view instead of a copy. Firefox reads were 10 to 30% slower (loops over a wasm memory view are slower there), so the copy stays.

### Quick (trim)
New `trim()`: a fresh instance of each compiled wasm module takes over and the grown memory goes with the old one. Nothing else in the API changes.

### Details (trim)
- Memory: core.wasm declares 384 MB of initial memory (static arrays), and the zstd module grows to about 45 MB. Pages that were never touched cost nothing, but touched pages stay. After pack, unpack and drop of a 66.6 MB file, `trim()` freed about 80 to 90 MB of browser memory in Chromium 155, Firefox 158 and WebKitGTK 2.52.6.
- Compiled modules are now kept (`MODS` in src/wasm.js), so `trim()` instantiates without compiling again. Before that change, `trim()` took 11 to 48 ms and the next pack ran on the browser's first code tier. Now it takes 2 to 24 ms: Chromium 2 ms, Firefox 14 to 24 ms, WebKitGTK 9 to 10 ms.
- Pack after `trim()` (3 packs of the 66.6 MB file at `access: 'random'`, each side of two trims) stays within the run's noise in all three browsers. Test: `tests/lfc-pack-memory-browser.js` (STEPS), `test/trim.cjs`.
- A job that is still running keeps its own instance (it holds it), so calling `trim()` between the awaits of `pool()` or `packParallel` is safe. The memory then goes when that job ends.

### Details (pack helpers)
`packParallel` helpers that wait for the next call (3 s; `warmPack` keepMs) now give back their packer memory as soon as they go idle. They keep the compiled wasm and their zstd memory, so the next call is as fast. Browser memory held between calls (median after 0.7 s idle, 4 helpers, 66.6 MB input, before / after): Chromium 1697 / 1501 and 1809 / 1476 MB, Firefox 1914 / 1592 and 1940 / 1591 MB, WebKitGTK 2234 / 1077 MB. The median of 7 back-to-back calls, before / after: Chromium 1216 / 1242 and 1214 / 1186 ms, Firefox 1312 / 1381 and 1336 / 1282 ms, WebKitGTK 1551 / 1475 ms. Giving back the zstd memory too was tried, and made Chromium back-to-back calls 6 to 10% slower, so the zstd memory stays.

### Deep (trim)
`packParallel` helpers each reserve about 402 MB of wasm (1.6 GB for 4). Pages that are never touched cost nothing, and the packer pages they touched now go when they idle (above). Main-thread `trim()` does not reach the helpers.
## 0.3.2 · API 0 · 2026-10-31

### Quick
Small-block packs no longer clear 16 MB per block.

### Details
dd_run sized its hash table to the block's strings (at least twice their count, up to 2^22 slots) and reset() clears only the shape slots used (SHSLOT). Pack ms old/new: Chromium geo 32 KB 1452/415, 256 KB 391/204, orders 32 KB 2572/1098, 256 KB 689/488; Firefox 1506/413, 408/249, 2658/897, 795/542; WebKitGTK 1700/432, 397/235, 2762/881, 704/531. Default 13 MB blocks unchanged (Chromium 151/151, 322/321). 28 files byte-identical.

### Deep
cherry-picked from the LFCP branch (463ff97) onto main; core.wasm rebuilt from main's core.c plus the fix (same size as the branch build).

## 0.3.1 · API 0 · 2026-10-30

### Quick
Nested decimal columns (width 7) decode in one pass with whole-number zigzag for varints up to three bytes. 30,000 GeoJSON-like lines unpack, 0.3.1 / 0.3.0: Chromium 0.77, Firefox 0.86, WebKitGTK 0.38; against 0.2.1 (no decimal format): 0.92, 0.90, 0.58. Same rows; files unchanged.

### Details
Laptop Chromium showed 0.3.0 map lines unpack at 1.17x of 0.2.1. A profile put 12 ms per read in decodeDecimalColumn: a separate varint pass into a Float64Array, then zigzag with % on doubles, then a running-sum array. Now one pass: varint, zigzag with integer ops when the value fits 21 bits (doubles above), the running sum kept in a ring of k values, and s / 10^d (division kept, so the same doubles). A cut-off column now throws 'damaged block'.

### Deep
lfc-pack 0.3.1: decimal decode in one pass. Container, 3 rounds of 11, medians ms (0.2.1 / 0.3.0 / 0.3.1): Chromium 76.4 / 91.2 / 70.2, Firefox 77 / 80 / 69, WebKitGTK 53 / 82 / 31. Found by the laptop Chromium run (41 vs 48 ms). All lfc-pack checks pass.

## 0.3.0 · API 0 · 2026-10-30

### Quick
Decimal number columns (up to nine decimals as scaled whole numbers), delta columns and nested number width 7 (with lag 1 to 4 for interleaved coordinates); unpackRows, stats, metadata/meta, hash, check: 'xxh64', rows: 'generated'; stricter damaged-file checks in JS, Python and Go. Files using delta or width 7 are refused by 0.2.x readers. Stacked on 0.2.1's tuned zstd; sizes as a share of 0.1.9: map lines 0.3045, prices 0.7787, dense 1.0258, logs 0.9991; times within container noise.

### Details
The LFCP spec thread's format branch, merged with main (13 MB blocks from 0.2.0, tuned zstd from 0.2.1). Each change alone, then all together (Node, container): the decimal branch and tuned zstd act on different columns, so the stack keeps both gains with no interaction. Readers: JS, Python (142 vector files), Go (main vectors), layout checker (nested width 0 to 7). Layout vectors regenerated with test/genlayout.cjs. wasm unchanged (main's tuned build).

### Deep
lfc-pack 0.3.0: decimal format branch stacked on 0.2.1. Node container sizes vs 0.1.9: prices 12.7 MB 0.7787, GeoJSON-like 11.4 MB 0.3045, web logs 22 MB 0.9991, dense 21.7 MB 1.0260. Pack/unpack within +-10% over 3 rounds of 7. The tester section 004 times 0.1.9, 0.2.0, 0.2.1, decimal-on-0.2.0 and the stack side by side. Owner picked 'Merge as 0.3.0 now' on the card.

## 0.2.1 · API 0 · 2026-10-30

### Quick
Large text-like column frames (256 KB or more, at the default level) now try two finer zstd settings on a sample from the middle of the frame and compress once with the winner. Logs 0.9658x the bytes, FHIR 0.9896x, nd_dense 0.9898x, events 0.9964x; other sets unchanged; pack time within noise in three browsers. The files are plain zstd frames, so every reader reads them.

### Details
zstd-glue.c gains an export tune(strategy, hashLog, chainLog, minMatch), applied on top of the level; zstd-dec.wasm is unchanged byte for byte. Candidates: level 3 as is, strategy fast with hashLog 18 and minMatch 6, then minMatch 7 (tried only if 6 won). Sample: the middle min(128 KB, frame/8). Text-like: about 2,048 evenly spaced bytes, at least 85% printable ASCII, newline or zero. Frames under 256 KB are not tuned: trying all three settings on the many mid-size dense columns made pack 6 to 15% slower, and sampling them made dense 0.1 to 0.2% larger. Python writer unchanged.

### Deep
lfc-pack 0.2.1: sample-choice zstd tuning on text-like frames of 256 KB or more. Sizes vs 0.2.0: logs 0.9658, events 0.9964, fhir 0.9896, nd_dense 0.9898, dense/links/lists/gen_logs/gen_config 1.0000. Pack ratio (container, 4 cores): Chromium 155 logs 0.94 events 0.98 dense 0.96 links 0.83; Firefox 158 1.03/0.99/0.98/0.99; WebKitGTK 1.02/1.06/1.02/0.98. Same rows back in all. Unpack bytes path unchanged (ratios 0.81 to 1.66 on identical files show the container noise). Tests: run.js, vectors, Python and Go readers pass. Layout vectors flat-all-types and flat-wide-dict regenerated.

## 0.2.0 · API 0 · 2026-10-30

### Quick
Default block size 13 MB (was 21 MB): parallel pack 34-36% faster on a 16-core laptop, same size; `packParallel` hands out one block at a time (7 to 27% faster); `warmPack(n)`. New `meta` option with `LfcPack.metadata(bytes)`, `LfcPack.unpackRows(bytes, {from, count})` (decodes only the blocks it needs, builds only those rows) and `LfcPack.stats(bytes)` (column facts from the footer). Faster one-column reads and wide row objects (WebKit 200-key whole read 1,324 to 580 ms). New `LfcPack.hash(bytes, kind)`, a file viewer (viewer.html), readers that refuse damaged blocks with a plain message, and an optional `check: 'xxh64'` block check with per-column checks (one-column reads about 40 to 50% faster).

### Deep
- New optional `meta` option for pack, packStream and packParallel and new `LfcPack.metadata(bytes)` (Python: `lfc_pack.metadata(path)`): an app can store a small description of the file (title, tables, column names and units) in the footer and read it without opening any block. Files without it are unchanged.
- New `LfcPack.unpackRows(bytes, {from, count})`: reads just a range of rows by decoding only the blocks that hold them (8 to 17 times faster than unpack and cut on a 200,000-row, 9-block file in Chromium, Firefox and WebKit). New `LfcPack.stats(bytes)`: per-block row counts and per-column distinct and null counts, read from block metadata without decoding any column. Files grow by about 230 bytes per 9 blocks (statistics in block metadata); older readers ignore them.
- Faster reads of one column from wide files: the block checksum now runs in the WebAssembly loop of the core module when it is loaded (before: plain JavaScript over the whole block, which was 75 to 95% of a one-column read of a 200-key file). One-column read of 20,000 rows with 200 keys: Chromium 15.6 to 9.3 ms, Firefox 21 to 8 ms, WebKit 12 to 9 ms; whole reads unchanged. The loop now sits in the zstd module itself (rebuilt with `wasm/build.sh`, same pinned zstd 1.5.7; the rebuild of the unchanged source reproduced the old files byte for byte first), so the read-only build has it too.
- New `LfcPack.hash(bytes, kind)`: `'crc32'` (default) or `'xxh64'` (16 hex digits, seed 0, from the xxhash already inside zstd). On 21 MB: crc32 about 1 GB/s, xxh64 about 2.8 to 3.2 GB/s in Chromium, Firefox and WebKit. Not used for anything inside the file yet.



- 0.2.0 (helper a054e41): wide row objects: the one-time timing of how to build dense rows also tries filling each row with all its keys, and drops a way more than 2.5 times slower in the warm-up round; WebKit 200-key whole read 1,324 to 580 ms.
- unpackRows makes row objects only for the asked range: 100 of 150,000 log rows, 64-82 ms to 30 ms in Node (whole read 78-85 ms). Laptop Firefox before: 139 ms vs whole 140 ms.
- Default block size 21 MB to 13 MB (owner card 2026.10.30 9:11 PM ET). Laptop Firefox 160, 4 helpers: logs 953->969 ms, events 340->224, dense 895->571; bytes 1.000/1.000/0.996. Container 3 browsers, 3 workers on 4 cores: pack within noise, sizes same or smaller.

## 0.1.11 · API 0 · 2026-10-30

### Quick
New packStream: feed text in pieces and write each block as it is ready, so packing a big file holds one block of text at a time

### Deep
packStream({blockBytes}) -> push(bytes) returns finished blocks, finish() returns the last blocks and the footer. Joined output is byte-identical to pack() for the same text and blockBytes (test/stream.cjs: 5 inputs, 3 push sizes each; Node correctness check, no speed claim). Value-exact mode only; exact mode throws. Built on pack() per block, so no new block code.

## 0.1.10 · API 0 · 2026-10-30

### Quick
New experimental unpackColumns reads flat-row files as typed columns without building row objects.

### Deep
New experimental LfcPack.unpackColumns(bytes, {keys}): returns each flat-row block as typed columns with presence bit planes, skipping row-object building. Container sample (direction only, 150k-row web-log blocks x3): 209 ms against 448 ms for unpack. No change to pack, unpack or file bytes. Laptop numbers to follow.

## 0.1.10 · API 0 · 2026-10-29

### Quick
New experimental unpackColumns reads flat-row files as typed columns without building row objects.

### Deep
New experimental LfcPack.unpackColumns(bytes, {keys}): returns each flat-row block as typed columns with presence bit planes, skipping row-object building. Container sample (direction only, 150k-row web-log blocks x3): 209 ms against 448 ms for unpack. No change to pack, unpack or file bytes. Laptop numbers to follow.

## 0.1.9 · API 0 · 2026-10-27

### Quick
New opt-in `packParallel(bytes, { workers })`: helper Web Workers pack runs of whole blocks at the same time (at most min(cores, 8)); the file has the same bytes as `pack`. Exact mode and small inputs stay on one thread.

### Deep
New opt-in packParallel(bytes, { workers }): helper Web Workers pack runs of whole blocks at the same time (at most min(cores, 8)); the file has the same bytes as pack. Exact mode and small inputs stay on one thread.

## 0.1.8 · API 0 · 2026-10-27

### Quick
The unpack pool starts 2 helpers when you do not say how many (it used to start up to 16): at 105 MB more helpers did not read faster and ran Firefox out of memory. Ask for more with workers.

### Deep
pool default size 2 (was min(16, max(3, cores-1))). Laptop 105.5 MB events: Chromium unpack 1/2/4/15 helpers 291/262/282/274 ms (JSON.parse 565); Firefox 159 1/2/4 helpers 451/421/806 ms (JSON.parse 533), 15 helpers out of memory. Files and rows unchanged.

## 0.1.7 · API 0 · 2026-10-27

### Quick
Flat number-list columns decode to small integers (variant 19), faster hex, address and dictionary checks when packing text; files and rows unchanged.

### Deep
Brief section 30 fifth addendum, variant 19. Container unguarded flat/nested unpack at 300,000 rows: Chromium 1.04 to 1.20 (noisy), WebKitGTK 0.85 to 0.89, Firefox 0.81; flat stays opt-in until the laptop guard.

## 0.1.6 · API 0 · 2026-10-26

### Quick
Flat writer also reads strings, true/false and null in wasm; flat list columns read faster in Firefox and WebKitGTK; output files unchanged.

### Deep
Brief sections 29 and 30 (variant 16): wasm scanner takes strings/booleans/null for flat packing, cheaper template pre-check, no plain copy of small dictionaries, engine-selected list builders. Files identical to 0.1.5 on test sets (fuzz 120 files + 25 edge cases pass).

## 0.1.5 · API 0 · 2026-10-26

### Quick
Dense rows (many keys per row) read much faster in Chromium and WebKitGTK; a one-time timing check keeps the old way where cloning would not help.

### Deep
Dense-row clone: container A/B on 40k dense rows, unpack Chromium 174 to 103 ms, WebKitGTK 336 to 103 (second run 77 vs 79, probe declines), Firefox 92 vs 92 (probe declines). Unguarded; laptop Chromium and Firefox runs pending.

## 0.1.4 · API 0 · 2026-10-26

### Quick
New Python writer (python/lfc_pack_write.py): packs NDJSON from Python into files that open in lfc-pack.js, with the byte-exact switch.

### Deep
Section 24: Python writer added from /mnt/project-files/json-format/python-writer. Checks: new python writer and JS-opens-Python steps in test/run.js (139 files incl. deep nesting, both value-exact and byte-exact lines). No JS code change.

## 0.1.3 · API 0 · 2026-10-26

### Quick
Faster pack for rows of plain numbers, and for link lists packed with { block: "flat" } (a small WebAssembly scanner); such files are also smaller.

### Deep
Section 28: fast flat writer (wasm/flatscan.c). Container, unguarded, noisy: links30k 497,468 to 440,238 bytes; 90k number-list rows 638,537 to 412,241 bytes; pack Chromium links 36.9 to 28.2 ms, nums 72 to 45; Firefox 37 to 26 and 98 to 80; WebKitGTK swings 30 to 63 run to run, so it needs the laptop page. Fuzz 120 files and 25 edge cases pass.

## 0.1.2 · API 0 · 2026-10-26

### Quick
Log-template columns read about 1.7 to 2.7 times faster (a small WebAssembly rebuild; the old code stays as the fallback).

### Deep
Section 27: log-template rebuild in wasm (wasm/tpl4.c, 3.6 KB). Container A/B, unguarded: 100k template lines unpack Chromium 89.5 to 32.9 ms, Firefox 47 to 27, WebKitGTK 71 to 41. JS fallback when no WebAssembly, frame over 8 MB, over 4M rows, over 65,536 templates, or memory over 1.5 GB.

## 0.1.1 · API 0 · 2026-10-26

### Quick
Link-list columns (357,110 down to 211,344 bytes on 30,000 nodes). Nested blocks 8 to 9% smaller. Log templates only when smaller and not slower to read. New decoder-only lfc-pack-read.js (51 KB gzipped, was 214 KB).

### Deep
Link-list columns store lists of whole numbers as lengths plus deltas: made-up 30,000 nodes with out and in lists went from 357,110 to 211,344 bytes. First-appearance flags for the string code column make nested blocks smaller: made-up events 1,039,963 to 949,619 bytes (-8.7%), FHIR 21 MB 620,633 to 570,752 (-8.0%). Log templates are chosen only when smaller than plain and a writer-side sample shows full-line reads are not slower. Flat rows pack with one JSON.parse per block and big flat-object blocks skip the nested pass. New decoder-only file lfc-pack-read.js: 143 KB (51 KB gzipped) against 671 KB (214 KB gzipped).

## 0.1.0 · API 0 · 2026-10-26

### Quick
First version: packs NDJSON into LFC-pack (.json.lfc) and reads it back with JSON.parse values, in WebAssembly. Nested and flat column layouts, automatic log templates, byte-exact switch, archive level, key and time-range reads, helper workers, Python reader. `packRows(rows)` takes row objects directly; `packTables({ nodes, links, view, ... })` / `unpackTables(file)` keep several tables and plain values in one file. The format is not frozen: 0.x files may not open in later versions.

### Deep
First version of lfc-pack (LFC-pack). Own zstd 1.5.7 build, tokenizer and string dictionary in wasm; nested and flat blocks; AUTO log templates; exact switch; level 19; keys and range reads; worker pool; Python reader. FHIR 21 MB 620,636 bytes; 260 MB 7,708,261; 757 MB 22,637,152 (Parquet zstd 3: 1,467,703 and 45,140,567). Speed not yet measured under the noise guard.

### 0.1.3 follow-up 2026.10.27 2238 ET
Lab A/B (Chromium, WebKitGTK) showed number-list rows read slower from flat blocks (Chromium 5.4 to 7.9 ms, WebKitGTK 34 to 50). Auto mode now leaves rows with list columns to the nested layout; { block: "flat" } still takes the fast writer. Lists file back to 365,098 bytes, unpack equal to 0.1.1 in all three browsers.
