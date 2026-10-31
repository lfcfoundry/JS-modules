# lfc-pack changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## Next (not released yet)
- New pack option `share: true` (off by default): nested blocks share one table of strings and row shapes for the whole file (new footer section 16, block header `g: 1`); a string or shape seen again in a later block is stored once. 100,000 GeoJSON points: 32 KB blocks 596,682 to 492,811 bytes (-17%), 256 KB blocks 402,133 to 355,765 (-12%); 100,000 orders -15% at 32 KB, -3% at 256 KB; at the default block size the size is within a few hundred bytes. Flat-column files are unchanged. JS, Python and Go readers read it; older readers refuse such a file (section 16 is marked required). `packParallel` packs on one thread when it is on.
- New pack option `access: 'random'` (off by default): the read-friendly preset, 256 KB blocks plus `share: true`. A 100-row `unpackRows` read decodes one small block (20 to 60 times faster than with the default 13 MB blocks in the earlier block-size test); files are 4 to 11% larger than the default on five test sets. The default stays 13 MB blocks.
- Damaged-file check: the JS, Python and Go readers now refuse a flat `H`, `U` or `I` column whose decoded frame is shorter than its row count needs (found while testing small blocks).
- Damaged-file checks, found by the fuzz test across the JS, Python and Go readers (a file with damage whose block checksum was fixed up on purpose): a reader now refuses a nested-block side-list index past the dictionary (Python and Go used to pad the gap with empty strings, JS left holes and dropped keys), dictionary text with a byte above 127 (JS read it as Latin-1, Go passed the raw byte on), a running-sum number column that passes 2^53 (JS, Python and Go rounded differently), and a flat block whose presence bits do not match a column's value count (JS read a full column without looking at its bits). The JS reader also refuses text that is not valid UTF-8, like the Python reader. Files made by the writers are unchanged. Remaining differences on damaged files: a flipped bit inside a zstd frame can decode to different bytes in different zstd decoders (the frames carry no content checksum, the block checksum is what catches it), and a text number column holding an integer above 2^53 reads exact in Python and as the nearest double in JS.
- Smaller files for decimal numbers (flat blocks): number columns with up to nine decimals are stored as whole numbers with a power-of-ten scale (before: only two decimals, otherwise raw 8-byte doubles), and non-increasing columns can store differences between neighbors (`delta`, new). 100,000 rows: sensor walk with 3 decimals 257,878 to 106,089 bytes (-59%), GPS latitude with 5 decimals 185,942 to 68,141 (-63%), price with 4 decimals 310,402 to 161,698 (-48%), uniform random with 3 decimals 358,103 to 212,902 (-41%), two-decimal noisy values -9%. Pack time within noise (uniform random decimals were 5 to 19% slower while both variants were compressed; a cheap size estimate now picks one). Files that use `delta` need a reader of this version (JS, Python and Go readers updated). 
- Same idea for nested blocks (rows with nested objects or lists), new number column width 7: a column of whole numbers or decimals is stored as scaled whole numbers, plain or as differences, when that compresses smaller than the typed bytes. 100,000 sensor rows with ids and lists 504,211 to 106,246 bytes (-79%); 50,000 GeoJSON points -40%; 50,000 orders with 2-decimal prices -50%; epoch milliseconds plus random big integers -14%. The JS, Python and Go readers and the layout checker handle width 7; older readers refuse such a file. Differences can be taken against the value 1 to 4 places back, so columns that interleave series (the x and y of coordinate pairs) shrink too: 50,000 GeoJSON points -65% in total (254,991 to 146,499 bytes); 200,000 rows with a [longitude, latitude] pair -62% (707,172 to 271,557 bytes), pack 12 to 21% faster, reads within noise. Pack time with it, 200,000 rows: Chromium -6% to +4%, WebKit -9% to +8%, Firefox -4% to +9%; reads within noise.
- New optional `meta` option for pack, packStream and packParallel and new `LfcPack.metadata(bytes)` (Python: `lfc_pack.metadata(path)`): an app can store a small description of the file (title, tables, column names and units) in the footer and read it without opening any block. Files without it are unchanged.
- New `LfcPack.unpackRows(bytes, {from, count})`: reads just a range of rows by decoding only the blocks that hold them (8 to 17 times faster than unpack and cut on a 200,000-row, 9-block file in Chromium, Firefox and WebKit). New `LfcPack.stats(bytes)`: per-block row counts and per-column distinct and null counts, read from block metadata without decoding any column. Files grow by about 230 bytes per 9 blocks (statistics in block metadata); older readers ignore them.
- Faster reads of one column from wide files: the block checksum now runs in the WebAssembly loop of the core module when it is loaded (before: plain JavaScript over the whole block, which was 75 to 95% of a one-column read of a 200-key file). One-column read of 20,000 rows with 200 keys: Chromium 15.6 to 9.3 ms, Firefox 21 to 8 ms, WebKit 12 to 9 ms; whole reads unchanged. The loop now sits in the zstd module itself (rebuilt with `wasm/build.sh`, same pinned zstd 1.5.7; the rebuild of the unchanged source reproduced the old files byte for byte first), so the read-only build has it too.
- New `LfcPack.hash(bytes, kind)`: `'crc32'` (default) or `'xxh64'` (16 hex digits, seed 0, from the xxhash already inside zstd). On 21 MB: crc32 about 1 GB/s, xxh64 about 2.8 to 3.2 GB/s in Chromium, Firefox and WebKit. 
- New pack option `check: 'xxh64'`: adds the XXH64 of each block as a seventh item of the block table entry (about 20 bytes per block); readers that know it check blocks with it instead of crc32. The crc32 stays, so older readers and the Python and Go readers need no change. For flat blocks it also stores, per column, an offset and an XXH64, and one XXH64 of everything before the columns: a read of a few columns checks and decodes only those (one column of 200 keys: Chromium 6.4 to 3.3 ms, Firefox 5 to 3, WebKit 6 to 4, against the whole-block xxh64 check). Files grow by about 16 bytes per column.
- Wide row objects: the one-time timing of how to build dense rows now also tries filling each row with all its keys before the next (before: plain or cloned only), and drops a way at once when it is more than 2.5 times slower in the warm-up round (the clone way took 5 s per round on 200 keys in WebKit). Whole read of 20,000 rows with 200 keys: WebKitGTK 1,324 to 580 ms; Chromium and Firefox unchanged (the timing picks per browser and varies a little from run to run).
- New read option `{ rows: 'generated' }` (off by default): wide dense row objects are built by one generated function per key set. It needs `unsafe-eval` in the page's security policy; if the engine refuses it, the normal ways are used. Whole read of 20,000 rows with 200 keys: WebKitGTK 628 to 183 ms, Chromium 585 to 465, Firefox 286 to 264; 50 keys: WebKitGTK 49 to 32, Firefox 69 to 55.

## 0.2.0 · API 0 · 2026-10-30
- Default block size 13 MB (was 21 MB): parallel pack 34-36% faster on a 16-core laptop, same size; `packParallel` hands out one block at a time (7 to 27% faster); `warmPack(n)`.
- New `meta` option with `LfcPack.metadata(bytes)`, `LfcPack.unpackRows(bytes, {from, count})` (decodes only the blocks it needs, builds only those rows) and `LfcPack.stats(bytes)` (column facts from the footer).
- Faster one-column reads and wide row objects (WebKit 200-key whole read 1,324 to 580 ms).
- New `LfcPack.hash(bytes, kind)`, a file viewer (viewer.html), readers that refuse damaged blocks with a plain message, and an optional `check: 'xxh64'` block check with per-column checks (one-column reads about 40 to 50% faster).

## 0.1.11 · API 0 · 2026-10-30
- New packStream: feed text in pieces and write each block as it is ready, so packing a big file holds one block of text at a time

## 0.1.10 · API 0 · 2026-10-30
- New experimental unpackColumns reads flat-row files as typed columns without building row objects.

## 0.1.10 · API 0 · 2026-10-29
- New experimental unpackColumns reads flat-row files as typed columns without building row objects.

## 0.1.9 · API 0 · 2026-10-27
- New opt-in `packParallel(bytes, { workers })`: helper Web Workers pack runs of whole blocks at the same time (at most min(cores, 8)); the file has the same bytes as `pack`. Exact mode and small inputs stay on one thread.

## 0.1.8 · API 0 · 2026-10-27
- The unpack pool starts 2 helpers when you do not say how many (it used to start up to 16): at 105 MB more helpers did not read faster and ran Firefox out of memory. Ask for more with workers.

## 0.1.7 · API 0 · 2026-10-27
- Flat number-list columns decode to small integers (variant 19), faster hex, address and dictionary checks when packing text; files and rows unchanged.

## 0.1.6 · API 0 · 2026-10-26
- Flat writer also reads strings, true/false and null in wasm; flat list columns read faster (number decoder, Firefox and WebKitGTK builders); output files unchanged.

## 0.1.6 · API 0 · 2026-10-26
- Flat writer also reads strings, true/false and null in wasm; flat list columns read faster (number decoder, Firefox and WebKitGTK builders); output files unchanged.

## 0.1.6 · API 0 · 2026-10-26
- Flat writer also reads strings, true/false and null in wasm; flat list columns read faster in Firefox and WebKitGTK; output files unchanged.

## 0.1.5 · API 0 · 2026-10-26
- Dense rows (many keys per row) read much faster in Chromium and WebKitGTK; a one-time timing check keeps the old way where cloning would not help.

## 0.1.4 · API 0 · 2026-10-26
- New Python writer (python/lfc_pack_write.py): packs NDJSON from Python into files that open in lfc-pack.js, with the byte-exact switch.

## 0.1.3 · API 0 · 2026-10-26
- Faster pack for rows of plain numbers, and for link lists packed with { block: "flat" } (a small WebAssembly scanner); such files are also smaller.

## 0.1.2 · API 0 · 2026-10-26
- Log-template columns read about 1.7 to 2.7 times faster (a small WebAssembly rebuild; the old code stays as the fallback).

## 0.1.1 · API 0 · 2026-10-26
- Link-list columns (357,110 down to 211,344 bytes on 30,000 nodes). Nested blocks 8 to 9% smaller. Log templates only when smaller and not slower to read. New decoder-only lfc-pack-read.js (51 KB gzipped, was 214 KB).

## 0.1.0 · API 0 · 2026-10-26
- First version: packs NDJSON into LFC-pack (.json.lfc) and reads it back with JSON.parse values, in WebAssembly.
- Nested and flat column layouts, automatic log templates, byte-exact switch, archive level, key and time-range reads, helper workers, Python reader.
- `packRows(rows)` takes row objects directly; `packTables({ nodes, links, view, ... })` / `unpackTables(file)` keep several tables and plain values in one file.
- The format is not frozen: 0.x files may not open in later versions.
