# lfc-pack developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 0.3.2 · API 0 · 2026-10-31

### Quick
Quick: small-block packs no longer clear 16 MB per block.

### Deep
Quick: small-block packs no longer clear 16 MB per block. Details: dd_run sized its hash table to the block's strings (at least twice their count, up to 2^22 slots) and reset() clears only the shape slots used (SHSLOT). Pack ms old/new: Chromium geo 32 KB 1452/415, 256 KB 391/204, orders 32 KB 2572/1098, 256 KB 689/488; Firefox 1506/413, 408/249, 2658/897, 795/542; WebKitGTK 1700/432, 397/235, 2762/881, 704/531. Default 13 MB blocks unchanged (Chromium 151/151, 322/321). 28 files byte-identical. Deep: cherry-picked from the LFCP branch (463ff97) onto main; core.wasm rebuilt from main's core.c plus the fix (same size as the branch build).

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

## 0.1.6 · API 0 · 2026-10-26

### Quick
Flat writer also reads strings, true/false and null in wasm; flat list columns read faster in Firefox and WebKitGTK; output files unchanged.

### Deep
Brief sections 29 and 30 (variant 16): wasm scanner takes strings/booleans/null for flat packing, cheaper template pre-check, no plain copy of small dictionaries, engine-selected list builders. Files identical to 0.1.5 on test sets (fuzz 120 files + 25 edge cases pass).

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
