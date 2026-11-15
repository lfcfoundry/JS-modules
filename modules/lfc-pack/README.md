# lfc-pack

**Version 0.13.3 · API 0**

**Tested in:** not recorded.

Part of [JS-modules](../../README.md). MIT License, Copyright (c) 2026 LFC Foundry. Contains zstd 1.5.7 (BSD-3-Clause, Meta Platforms), see [NOTICE-zstd.txt](NOTICE-zstd.txt).

## What it is and how it works

LFC-pack is a compact file format for rows of JSON (logs, events, API exports), with a one-file library that writes and reads it. Files end in `.json.lfc`.

- Rows are cut into blocks of about 13 MB, and each field becomes its own typed column.
- Repeated text is stored once, numbers are stored as numbers, and each column is compressed with zstd.
- A footer lists every block and its value ranges, so a reader opens only the blocks and columns it needs.

Reading gives back what `JSON.parse` would, or the exact original bytes with `exact: true`. Readers in Python and Go open the same files.

## Why it exists

JSON repeats every key on every row and stores numbers as text, and getting one field means parsing the whole file. gzip shrinks it but still needs a full parse; Parquet wants a fixed schema and a large reader. LFC-pack keeps JSON's flexibility and aims to be smaller than Parquet and at least as fast to read as `JSON.parse`.

**Where it helps**

- Large datasets inside offline single-file apps.
- Logs and events where you read only a time range or a few fields.
- App state with several tables, saved as one file.

**Not for:** data already in a Parquet pipeline, or small files where JSON with gzip is simpler. The format is not frozen until a formal release.

## Use

```html
<script src="lfc-pack.js"></script>
<script>
  // Load the wasm once (init({ readOnly: true }) if you only read).
  LfcPack.init().then(function () {
    // string, Uint8Array or Buffer in; the .json.lfc bytes (Uint8Array) out
    var file = LfcPack.pack(ndjsonText);
    // array of row objects, same values as JSON.parse of each line
    var rows = LfcPack.unpack(file);
    // { rows, blocks, size, major, minor }
    var meta = LfcPack.info(file);
  });
</script>
```

Options for `pack(input, options)`:

| Option | Meaning |
|---|---|
| `exact: true` | the byte-exact switch: `unpackText(file)` returns the input bytes unchanged (spacing, key order, escapes, `1.0` spelled as written, CRLF, blank lines, invalid UTF-8). Costs size: rows whose text is not the canonical form keep their original line. Default is value-exact (same values, keys in first-seen order). |
| `level: 19` | the archive setting: slower to write (about 15x), about 12% smaller. Default is 2 for flat blocks since 0.10.24 (level 3 writes the old bytes). Logs are about 0.4% larger at 2 and save in 0.86 to 0.90 of the time. Where it loses: big plain-text columns of mostly different values compress 12 to 21% worse at level 2, so a 7.2 million row table with such a note column came out 10.3% bigger (9,145,467 against 8,292,231 bytes); pass `level: 3` for tables like that. 3 for raw blocks and the footer. |
| `block: 'nested' \| 'flat'` | force one layout. Default: each block is written as nested columns and, when it could win, as flat columns too, and the smaller one is kept. |
| `check: 'crc32'` | since 0.10.22 files carry the faster XXH64 checks by default (a whole-block check and one per column, so reading one column checks only that column's bytes; about 85 bytes more per block); `check: 'crc32'` writes the older table. The crc32 is written either way, so older readers, the Python and Go readers read both kinds unchanged. |
| `blockBytes` | block size, default 13 MB (faster parallel pack than 21 MB, same size). |
| `share: true` | shared string and shape tables for nested blocks: a string or row shape seen again in a later block is kept once in the footer. Smaller files with small blocks (100,000 GeoJSON points: -17% at 32 KB blocks, -12% at 256 KB); about the same at the default block size (a few hundred bytes either way). `packParallel` packs on one thread with it. Off by default. |
| `paths: false` | switch off per-path strings for nested blocks (on by default): each string path (`.properties.name`, `.items[].sku`) keeps its own dictionary run and repeat numbers, which are small and compress well. 100,000 GeoJSON points -11% at the default block size, -14% at 256 KB blocks; 100,000 orders -6% and -5%. Each block keeps whichever layout is smaller. With `share: true` too (stacked): 256 KB blocks GeoJSON -22%, orders -4%. Pack and read speed within noise of the old layout in Chromium, Firefox and WebKit. |
| `paths: 'auto'` | same as the default since 0.4.6 (kept so older code still works). Each big nested block keeps per-path strings unless the string text they would store twice is more than 11% of the block's text; then it uses the plain layout. This helps records with many paths that each hold few strings, like FHIR: 48 MB of real FHIR is 6% smaller, and all 260 MB is 12% smaller and reads 13 to 22% faster. There is no trial or sample, so pack and packParallel write the same bytes. |
| `access: 'random'` | the read-friendly preset: 256 KB blocks plus `share: true` (options given next to it win; per-path strings are on as everywhere). Reading 100 rows with `unpackRows` decodes one small block (20 to 60 times faster in tests); files 4 to 10% larger than at the default block size (GeoJSON and orders +10%, three flat test sets +4 to +5%). `'whole'` (default) changes nothing. |
| `templates: false` | switch the automatic log templates off. |
| `templates: true` | try the log-template layout on every long text column (it is not tried on every column by default). Since 0.10.32 the template layout is built in WebAssembly: a save with it takes 0.52 (Chromium 156), 0.57 (Firefox 158) and 0.60 (WebKitGTK 2.52.6) of the 0.10.31 time, with the same file bytes. |
| `fast: false` (fast is the default since 0.12.0, and applies to text and dictionary columns given as bytes since 0.12.1; `fast: true` still works, it was added in 0.10.34) | opt out of the quicker text-heavy save: without it, text columns are compressed at zstd level 3 and every text column gets the dictionary count, so files can be a little smaller on logs (+0.2% with fast) and larger on Workbench-style rows (0.60 with fast). With fast, text columns are compressed at zstd level 1, and a text column of 4,096 or more values that is nearly all different skips the dictionary count. Same page, new default against 0.11.2, Workbench-style 600k rows: 0.82 / 0.77 / 0.99 of the save time in Chromium 156 / WebKitGTK 2.52.6 / Firefox 158; logs 0.95 to 1.00 |

Reading:

```js
// only these keys (flat blocks never decode the others)
LfcPack.unpack(file, { keys: ['ts', 'status'] });
// rows whose number is in range; blocks outside it are not opened
LfcPack.unpack(file, { range: { key: 'ts', min: 1760000000, max: 1760003600 } });
// rows where one key equals a value (strict ===; a missing key never matches null); same rows and key order as unpack(file).filter(...), without building the other rows
LfcPack.unpack(file, { equals: { key: 'level', value: 'ERROR' } });
// anyOf (since 0.10.2): several values in one pass, rows in file order, a missing key never matches; one pass over the file instead of one call per value
LfcPack.unpack(file, { equals: { key: 'level', anyOf: ['WARN', 'ERROR', 'FATAL'] } });
// row numbers instead of rows (since 0.10.19): a Uint32Array of the positions, in file order, of the rows the same equals / anyOf / range query returns, and no row objects made (keys, rows and cache have no effect; with table, numbers within that table's rows)
LfcPack.unpack(file, { equals: { key: 'level', value: 'ERROR' }, positions: true });
// asking again and again on the same file bytes: cache: true keeps what the first query decoded (up to LfcPack.cacheLimit(), 64 MB by default, least recently used blocks go first)
LfcPack.unpack(file, { equals: { key: 'level', value: 'WARN' }, cache: true });
LfcPack.clearCache();   // drop everything the cache holds (LfcPack.cacheBytes() says how much)
// since 0.10.6 and 0.10.7, reads of tables with 20 or more keys where some rows lack keys build rows one at a time in Chrome and Edge only (whole tables, filtered, range and row-window reads); Chrome 157 laptop: whole tables 0.20 to 0.82 and filtered reads 0.44 to 0.93 of the 0.10.4 / 0.10.6 time; Firefox and Safari run the same code as before
// opt-in lazy rows (see "Lazy rows" below): values are read when a key is first used
LfcPack.unpack(file, { rows: 'lazy' });      // columns decoded at unpack, rows made cheaply
LfcPack.unpack(file, { rows: 'lazycols' });  // a column is decoded only when some row reads its key
// Uint8Array of NDJSON text (exact if packed with exact: true)
LfcPack.unpackText(file);
// opt-in: same file bytes as pack(), blocks packed by helper Web Workers
// (max min(cores, 8)); exact mode and small inputs stay on one thread
LfcPack.packParallel(bytes, { workers: 4 }).then(function (file) { /* ... */ });
// helper Web Workers do the byte work; rows are built on the calling thread;
// without workers you get 2 (at 105 MB more helpers did not help in Chromium
// and slowed Firefox)
LfcPack.pool({ workers: 3 }).then(function (pool) {
  // same options as unpack
  return pool.unpack(file).then(function (rows) { pool.close(); return rows; });
});
// memory limits (0.9.0): { stable: true } promises you will not change the bytes until the read settles, so a block is copied only when a
// helper takes it; LfcPack.pool({ maxInflightBytes }) caps the block bytes handed to helpers at once (a bigger block still runs, alone);
// { signal } (an AbortSignal) cancels a read; pool.stats() reports queued, in-flight and copied bytes
```

Row objects in, row objects out (no NDJSON text), and whole documents made of several tables plus plain values (a map with nodes, links, states and view settings):

```js
// array of objects -> file bytes (since 0.10.4, number-heavy tables of 100,000 rows save in 0.45 to 0.72 of the 0.10.3 time in Chromium 156 and Firefox 158; same bytes)
var bytes = LfcPack.packRows([{ id: 1, name: 'a' }, { id: 2 }]);
// the same rows back
var rows = LfcPack.unpack(bytes);
// arrays become tables, other values are kept as they are
var file = LfcPack.packTables({ nodes: nodes, links: links, states: states, view: { zoom: 2.5 }, title: 'My map' });
// { nodes, links, states, view, title }, value-exact
// (JSON values only: -0 becomes 0, undefined and NaN are lost, as with JSON.stringify)
var map = LfcPack.unpackTables(file);
// same options as unpack, per table
LfcPack.unpackTables(file, { keys: ['id'] });
```

Works under a page policy of `script-src 'wasm-unsafe-eval'` and `worker-src blob:` only: no `eval`, no `new Function`, no remote scripts (the helper workers start from a blob made of this file).

Saving big row arrays (since 0.10.8): `LfcPack.packRowsParallel(rows, opts)` returns a promise of the same bytes `packRows` writes. Rows are still read on the calling thread; number columns of 8,192 values or more are encoded and compressed in helper workers (at most 4, closed 3 seconds after the last call). Under about 52 MB of row text it just calls `packRows`. The first call in a page saves on the calling thread and starts the helpers afterwards (or call `warmPack()` first), so later saves are the fast ones: 0.54 (Chromium 156), 0.58 (Firefox 158) and 0.64 (WebKitGTK 2.52.6) of the `packRows` time on 300,000 rows of number-heavy data, cloud runs (first call 0.84 to 1.04). Since 0.10.10 it hands control back to the page after each block: the longest main-thread pause on 300,000 rows fell from 210 / 214 / 178 ms to 53 / 29 / 27 ms (Chromium 156 / Firefox 158 / WebKitGTK 2.52.6), at a cost of 0.99 to 1.02 of the 0.10.9 time on later saves and 1.04 to 1.08 on the first call. Same file format, same bytes.

Packing a file without reading it first (since 0.10.9): `LfcPack.packParallel(file)` takes a `File` or `Blob` as well as bytes. The calling thread only reads small windows to find where blocks end; each helper reads its own byte range. Same bytes as packing the bytes, and faster (0.83 to 0.95 of the time in Firefox 158, 0.87 to 0.92 in WebKitGTK 2.52.6, cloud runs), and the page never holds the whole file twice (about 30 to 110 MB less peak memory on a 121 MB file, and a much shorter pause on the main thread). The `exact`, `share` and `balance` options read the whole file as before.

Skipping blocks in equality reads (since 0.10.11): files written with the random-access preset (blocks of 1 MB or less, two or more blocks) also keep a small Bloom filter for each text column of each block, in their own compressed area after the blocks (about 0.4% more bytes). `unpack(file, { equals: { key, value } })` (or `anyOf`) then skips every block whose filter shows the value is not there; a value that is not in the file at all comes back in about a quarter of the time (a weighted figure over the cloud test browsers, Chromium 156, Firefox 158 and WebKitGTK 2.52.6). Saves with the default settings are unchanged. Older readers ignore the area and read the file as before. Files written by `packStream` carry no filters yet.

Saving columns you already have (since 0.10.12): `LfcPack.packColumnsParallel({ id: ids, price: prices, name: names }, opts)` returns a promise of the file for the rows `{ id: ids[i], price: prices[i], name: names[i] }`, without building row objects. Each value is a plain array or a number typed array (`Float64Array`, `Int32Array`, ...; not BigInt), all the same length; a wrong type or unequal lengths reject the call. It uses the same helpers, first-call rule and gates as `packRowsParallel`, and later saves of number-heavy tables take 0.66 (Chromium 156), 0.42 (Firefox 158) and 0.74 (WebKitGTK 2.52.6) of the `packRowsParallel` time on 300,000 taxi-like rows, 0.71 to 0.73 for sensor rows in Chromium and Firefox, and 0.90 to 0.96 for logs (cloud runs). Number tables give the same bytes as `packRows`; on tables that `packRows` sends down the text path (many string columns) the file can differ by a few hundredths of a percent, and it reads back exactly.

Reading a whole table as columns (since 0.10.15): `await LfcPack.unpackColumnsParallel(bytes, { keys, workers })` resolves to `{ key: array }` with no row objects: blocks are decoded in helper workers and each key's pieces are joined on the calling thread. Number columns of one kind come back as typed arrays of that kind (mixed kinds as `Float64Array`), everything else as plain arrays, and a key some rows lack gives `undefined` at those rows. It works on flat-row files (not nested blocks), and the result can go straight to `packColumnsParallel`. The first call reads on the calling thread and starts the helpers afterwards (they close after 10 seconds idle); one-block files never use helpers. Later reads took 0.30 (Chromium 156), 0.37 (Firefox 158) and 0.41 (WebKitGTK 2.52.6) of the `unpackRows` time on 300,000 taxi-like rows, and 0.66 to 0.73 on logs (cloud runs); on an owner laptop the longest pause on the page fell from 354 to 46 ms. Since 0.10.14, `unpackRows` in Firefox and Safari-family engines builds dense blocks in chunks of 1,024 rows (0.85 to 1.02 of the 0.10.13 time in Firefox 158; Chrome and Edge are unchanged).

Sums and averages without building columns: `LfcPack.aggregate(bytes, { key: 'tip' })` returns `{ sum, count, avg }`, and `LfcPack.aggregate(bytes, { key: 'tip', by: 'zone' })` returns `{ keys, sum, count, avg }` with one entry per group, in first-seen order. Values that are not numbers (null, text, missing) are skipped. Bit-packed number columns are summed in WebAssembly as exact whole numbers and divided once, so the sum is the decimal sum as written, rounded once (a plain loop can differ in the last digits). Repeat calls on the same bytes object check each block once. On 1M taxi-like rows, repeat calls took 1.6 / 3.0 / 6.2 ms in Chromium 156 (sum of fare / sum of tip / average tip per zone) against 4.3 / 5.4 / 9.1 ms for DuckDB-WASM on its own loaded table, and 2 / 2 / 4 against 9 / 11 / 17 ms in WebKitGTK 2.52.6 (cloud runs). Flat-row and small raw files only.

Since 0.10.29 the kernels skip empty values without a branch (B48), presence bits are counted in WebAssembly (B49), and `warm()` runs a few hundred tiny kernel calls in an idle task of its own (B50), so the first `aggregate` after `warm()` runs at full speed. First sum of fare on 1M taxi rows after `warm()`: 4.4 / 4 / 5 ms in Chromium 156 / Firefox 158 / WebKitGTK 2.52.6, against 6.3 / 5 / 7 ms for 0.10.28 and 5.7 / 5 / 11 ms for Apache Arrow 21.2.0 IPC (first sum, cloud runs, medians of 5 fresh pages). `init()` is unchanged; the extra warm-up costs about 1-4 ms inside `warm()`.

Number columns with empty values as typed arrays: `unpackColumns(bytes, { keys, nulls: 'NaN' })` (also `unpackColumnsParallel` and `R.columns(i, ...)`) gives every number column one value per row in a typed array, with NaN where the value is null or the row lacks the key; text and other columns are unchanged. Without it, a number column with any null comes back as a plain list, which V8 reads about 10 times slower.

Filling arrays you keep (since 0.10.33): `unpackColumns(bytes, { keys, nulls: 'NaN', into: { fare: new Float64Array(totalRows) } })` writes that key's number column into your `Float64Array` (block after block, one entry's `cols.fare` is a view of it) instead of making a new 8 MB array on every call, so pass the same arrays again to read the next file. A number column then always comes back as a `Float64Array`, even when it has whole numbers only (the usual result is an `Int32Array`); a key that is not a plain number column, or is missing from some rows, still comes back as a fresh array, so read the result's `cols`. Throws if an array is not a `Float64Array` or is too short. Warm 1,000,000-row read: 0.75 to 0.82 of the time in Chromium 156, 0.82 to 0.87 in Firefox 158; WebKitGTK 2.52.6 is within its timer's noise. Don't use an array while another read is filling it.
Reading a whole table as rows (since 0.10.18): `await LfcPack.unpackRowsParallel(bytes, { workers })` resolves to the same rows as `unpackRows(bytes)`. Helper workers decode the blocks and the calling thread builds each block's rows in order, pausing between blocks, so the longest page pause during a 300,000-row read falls from 186-305 ms to 34-64 ms (Chromium 156, Firefox 158 and WebKitGTK 2.52.6 container runs). The first call reads on this thread and then starts helpers (at most 4, closed after 10 s idle); later reads took 0.78 of `unpackRows` in Chromium 156 and 0.77 to 0.93 in Firefox 158 (taxi-like table). WebKit browsers, other options, one-block files and non-flat files use plain `unpackRows`.

Row numbers instead of rows (since 0.10.19): `LfcPack.unpack(file, { equals: { key, value }, positions: true })` (also `anyOf` and `range`) returns a `Uint32Array` of the numbers of the matching rows, in file order, without building any row object, for callers that keep their own columns. The numbers are the same as the indexes of the rows `unpack(file)` gives, so `unpack(file)[positions[i]]` is the i-th match. Measured on 200,000-row tables in cloud Chromium 156, Firefox 158 and WebKitGTK 2.52.6 (median of 5 fresh pages, 9 runs each): a common or rare value takes 0.10 to 0.28 of the time the row read takes, a range that keeps half the rows 0.14 to 0.31, a value that is not there the same time. Without `positions` nothing changes.

Small tables (since 0.10.20): a table of 32 rows or fewer that is one block is also written as plain text in one raw block (kind `r`, zstd level 3), and whichever is smaller is kept, so tiny files come out about 20 to 50% smaller (taxi rows: 1 row 0.51, 5 rows 0.56, 20 rows 0.82 of the 0.10.19 size; at 100 rows and more nothing changes and the bytes are the same). Rows read back with the same values and the same key order as before. Writing a table under 32 rows takes about 10 to 60 microseconds more; reading a 5-row table is 0.59 to 0.75 of the time. Not used with `exact`, `share`, a set `block` layout or `level`. Also, a one-block file under 100 rows carries no zone maps (they cost 60 to 200 bytes and one block has nothing to skip), so `open().zone(i, key)` returns `null` for those files. `unpackColumns` and `unpackColumnsParallel` read these raw blocks as well.

Metadata: `pack`, `packStream` and `packParallel` take an optional `meta` object (a small JSON-able note about the file, kept in its own footer section that older readers skip). `LfcPack.metadata(bytes)` reads it back without decoding any block; in Python use `lfc_pack.metadata(path)`. See `SECTIONS.md`.

Workers: `LfcPack.packBlock(chunk, opts)` packs one chunk of whole lines on its own (run it in any worker; the result is plain bytes), and `packStream(opts).pushPacked(bytes)` appends those chunks in text order on the main thread. Cut the chunks where `push` would: at the first line end at or after `blockBytes` (the last chunk may be shorter). The file is byte for byte the one `push` gives. `share` and `exact` are not supported here. Two workers took 0.60-0.74x the time of `push` on the main thread for 33 MB (Chromium 155, Firefox 158, WebKitGTK 2.52.6); one worker is slower than `push`. Check: `tests/lfc-pack-packblock-browser.js`.

Blocks given as columns (since 0.10.27): `await LfcPack.packBlock({ id: ids, name: names, note: notes }, opts)` packs one block from columns you already hold and resolves to the same kind of piece for `pushPacked`, with no JSON text and no row objects. A column is an array, a number typed array (a `Float64Array` is read in place), or text as `{ bytes, start, end }`: UTF-8 bytes (a CSV chunk, say) plus one start and one end offset per value, read in place, so no JS string is made (`packColumnsParallel` takes this form too). Text given as bytes is written exactly as the same text given as strings. Building columns from CSV bytes and packing 1,045,512 rows took 0.52 of the time with string columns in Chromium 156, 0.58 in Firefox 158 and 0.32 in WebKitGTK 2.52.6 (cloud, ratio of median times). Every column must have the same length; offsets outside the bytes and text that is not valid UTF-8 are refused.

Dictionary columns (since 0.10.38): a text column you already hold as small numbers goes in as `{ kind: 'dict', labels: { bytes, start, end }, ids }`, where `ids` is a Uint8Array, Uint16Array or Int32Array with one label number per row. The file is the same bytes as packing the same text, the text comes back exactly, and packing skips the work of finding the distinct values (about a quarter of the time for ten low-variety columns of a 21,800-row block in Chromium 156, Firefox 158 and WebKitGTK 2.52.6). Labels the block never uses are fine, so one dictionary can serve several blocks.

Text that arrives in pieces (since 0.8.0): `const ps = LfcPack.packParallelStream({ workers: 3 })`, then `ps.push(bytes)` for each piece (a parser's output, a download chunk; you may reuse your buffer right after the call) and `const file = await ps.finish()`. Blocks are cut where `pack` cuts them and go to helper Web Workers at once, so packing runs while the rest of the text is still being read. The file is byte for byte the one `pack` writes. `share` and `exact` are not supported. It pays on big inputs: 99 MB of 5-column rows pushed in 64 KB pieces took 0.65 to 0.82 (Chromium 156), 0.70 to 0.77 (Firefox 158) and 1.09 to 1.20 (WebKitGTK 2.52.6, slower) of the time `pack` takes on the main thread (two runs of 3 paired rounds, 3 workers, 4-core cloud machine, text already in memory, so no overlap with a parser is counted); for 33 MB it was no faster, so use `pack` for small inputs. Check: `tests/lfc-pack-stream-browser.js`.

Reading part of a file: `LfcPack.unpackRows(bytes, { from, count })` decodes only the blocks that hold those rows, `LfcPack.stats(bytes)` reads per-column facts from the footer, and `LfcPack.hash(bytes, kind)` gives `'crc32'` or `'xxh64'`.

Files too big to hold in memory (since 0.5.0): `const R = await LfcPack.open(file)` takes a `File` or `Blob` (or a function `read(offset, length)` with its `size` set, or bytes) and reads only the 16-byte trailer and the footer. Then `await R.rows({ from, count, table })` and `await R.block(i)` fetch just the byte ranges of the blocks they need and give the same rows as `unpackRows`; `R.info`, `R.meta` and `R.blocks` (`{ offset, length, rows, kind, table, first }`) describe the file. Memory is bounded by the footer and one block; since 0.10.3 a block is decoded straight into the WebAssembly output buffer instead of a second JavaScript copy, which cut memory by 32 to 39% at 1 to 4 MB blocks (counted by the module's memory counters, same rows and files; `LFC_WA=0` turns it off in Node). Saves of more than 4 MiB of text start with a 64 KiB first block (since 0.10.2), so a viewer shows its first rows sooner: the first screen of a big file took 6 to 15% of the time in Chromium 156, Firefox 158 and WebKitGTK 2.52.6 (cloud). Files grow 0.04 to 0.26%. Files with raw blocks (byte-exact text that is not plain rows) are still read whole on the first call. Each block is checked against its checksum when it is read. Since 0.5.9 the reader adds two calls for column work:

- `await R.columns(i, { keys })` gives block `i` as typed columns, the same entry `unpackColumns` gives for that block, while fetching only that block. Since 0.10.28 a nested block (auto mode can write one, for example a small first block whose first row has an empty number cell) is read as rows and turned into columns, here and in `unpackColumns`, `unpackColumnsParallel` and `aggregate`, instead of making the whole file refuse column reads.
- `R.readAhead()` (since 0.10.2, opt-in): call it after showing the first rows; when the page is idle it reads and decodes the next block that has not been read, so the next big read does not pay the browser's warm-up. One block per call, one at a time. It returns a promise: `true` when it read a block, `false` for a raw-block file, a file already fully read, or an error (it is only a hint).
- `await R.block(i, { rows, keys })` (since 0.10.26) gives only the rows at those positions inside block `i` (0 is the block's first row, `R.blocks[i].first` is its row number in the file), in the order you list them, and the same objects `R.block(i)` holds there. Each column decodes only those values where it can, so a sorted page that needs a few rows from many blocks no longer builds every row of each block: 2 rows from each block of a 1.2-million-row file took 0.39 of the time in Chromium 156, 0.41 in Firefox 158 and 0.38 in WebKitGTK 2.52.6 (cloud, ratio of median times; 50 rows per block: 0.44 / 0.27 / 0.36). `keys` (optional) reads only those keys. At half a block or more, and for nested or raw blocks, the whole block is read and the rows picked from it. A position outside the block throws a `RangeError`.
- `R.zone(i, key)` gives `{ min, max, count }` of a number column in block `i` from the footer, without decoding anything, or `null`. A filter such as `id >= 7000000` can skip a block whose `max` is lower.

`viewer.html` is a single-file viewer for `.json.lfc` files (open it in a browser and drop a file on it).

Specs: `SPEC.md` (container), `LAYOUT-SPEC.md` (flat and nested block layouts) and `INTEROP.md` (what every reader must agree on, with test vectors in `vectors/`). The Go reader in `go-reader/` is built from them.

Python (needs `pip install zstandard`, or Python 3.14): `python/lfc_pack.py` gives `read(path)`, `read_tables(path)`, `read_text(path)` and `info(path)`, with the same values.

Python writer: `python/lfc_pack_write.py` has `write(src, dst, level=3, exact=False)`, `pack(ndjson_bytes)`, `pack_rows(list)` and `pack_exact(ndjson_bytes, level, mode)` (mode `"lines"` or `"spelling"`). It writes nested and flat blocks and link-list columns, values exact (numbers are doubles); files open in `lfc-pack.js` and `lfc_pack.py`. No log templates, no helper-worker splitting. A block never ends up larger than plain zstd of its lines.

## Lazy rows (opt-in, since 0.6.0)
`unpack(file, { rows: 'lazy' })` and `{ rows: 'lazycols' }` return rows that read their values from the decoded columns instead of copying them into one plain object per row. With `'lazycols'`, a column nobody reads is never decoded. Both are off by default, and nothing changes unless you ask for them. They apply to dense flat blocks. Other blocks (nested, sparse keys, a key named `toJSON` or `__proto__`) give plain rows as before.

Limits:
- Rows are not plain objects. `row.key`, `'key' in row`, `for...in` and `JSON.stringify(row)` work as usual, but `Object.keys(row)` is empty, and spread (`{...row}`), `Object.assign`, `hasOwnProperty`, `structuredClone` and `postMessage` lose the values. Copy with `JSON.parse(JSON.stringify(row))` before sending rows to a worker.
- The file's block checks still run at unpack. With `'lazycols'`, a column that passes those checks but cannot be decoded throws the first time a row reads it, not at unpack.
- The rows keep the block's compressed columns alive until the rows are dropped.
- If you read every field of every row, plain rows are as fast or faster (see below).

Speed: 300,000 rows of 8 keys (a 33 MB JSON array, a 46 KB `.json.lfc` file). `JSON.parse` gets the same rows as `TextDecoder` + `JSON.parse` of the JSON text. Median of 5 runs taking turns, in ms (lower is better):

| Browser | What the page does | `JSON.parse` | lfc-pack plain rows | `rows: 'lazy'` | `rows: 'lazycols'` |
|---|---|---|---|---|---|
| Chromium 155 | open | 206 | 159 | 69 | 22 |
| | open + read 1 field of every row | 168 | 117 | 58 | 26 |
| | open + read all 8 fields | 161 | 162 | 118 | 130 |
| Firefox 158 | open | 213 | 87 | 84 | 40 |
| | open + read 1 field | 209 | 92 | 78 | 45 |
| | open + read all 8 fields | 201 | 86 | 112 | 155 |
| WebKitGTK 2.52.6 | open | 202 | 59 | 42 | 20 |
| | open + read 1 field | 214 | 60 | 56 | 29 |
| | open + read all 8 fields | 275 | 61 | 86 | 81 |

All three modes return the same values as `JSON.parse` in each browser. Use `'lazycols'` when a page reads a few fields of big files. Keep plain rows when it reads every field, or when rows go to `postMessage` or spread.

## Warm up when the page is idle (opt-in, since 0.6.1)

The first save and the first open in a fresh page pay for starting the WebAssembly and warming up the JavaScript. Call `LfcPack.warm()` once when the page is idle, and the first real call skips most of that:

```js
LfcPack.warm();   // returns a promise: true when done, false if it could not run; calling it again returns the same promise
```

Since 0.13.1, `LfcPack.warm({ rows })` also packs the first 3,000 of your own rows three times, each in a task of its own, so the first real `packRows` has already run the same row paths on rows shaped like yours. Your rows are not changed and later saves write the same bytes; calling it again with rows returns the same promise, and without `rows` it is the plain `warm()`. Cloud first `packRows` in Chromium 156: 113 ms with no warm-up, 107.5 ms after `warm()`, 91.6 ms after `warm({ rows })`; Firefox 158 shows no gain (43, 47, 43 ms), so there it only costs the idle work.

It starts the WebAssembly, then packs and opens one made-up table set (400 rows and 1,200 links), each step in a task of its own, so the page stays responsive. In Chromium 155, warm() itself takes 44 to 52 ms of wall time, with no task over 50 ms. Nothing changes unless a page calls it, and the bytes written are the same. The decoder-only build has no writer, so its warm() resolves false.

First call after warm(), compared with no warm-up (fresh browser per run, medians; lower is better):

| Browser | First save, 20,000 nodes | First open, 20,000 nodes | First save, 3,000 nodes | First open, 3,000 nodes |
|---|---|---|---|---|
| Chromium 155 | 0.85 | 0.90 | 0.53 | 0.73 |
| Firefox 158 | 0.97 | 0.70 | 0.67 | 0.85 |
| WebKitGTK 2.52.6 | 0.66 | 0.67 | 0.46 | 0.43 |

## Delta saves (prototype, off by default)
`packTables(tables, {base: baseBytes})` writes only what changed since `baseBytes` (a full file you saved earlier): rows are compared as text, so nested rows (such as map items with `attrs`) work. The result is a normal file that carries the base's XXH64 in footer section 17; `unpackTables(delta, {base: baseBytes})` rebuilds the tables, and a call with the wrong or missing base throws. Pass `dirty: {tableName: [rowNumbers]}` when the caller already knows which rows it touched to skip the comparison. Measured in Node on 8,000 nodes and 24,751 links with 10 to 80 edits: the patch is 0.7 to 3.5 percent of a full save, saving takes 0.25 to 0.42 of the time (0.01 to 0.05 with `dirty`), and reading takes about 0.84 to 1.3 of a full read. Reading must decode the base too, so it costs about 0.9 to 1.3 of a full read; pass `baseTables` (the tables the base was saved from or read into, unmodified; the result shares their row objects) and it drops to about 0.1 of a full read. The first delta save against a base reads the base once. Not part of the stable API; see LAYOUT-SPEC.md 4a.

## How the file is laid out
- **Nested blocks** (any JSON): each row is split into a *shape* (its keys, nesting and value kinds) and its values. Rows with the same shape share one entry. Strings of the block go into one dictionary (each distinct string once, rows hold small codes); numbers and booleans go into one column per path (`.actor.id`, `.payload.commits[].sha`), stored at the narrowest width that holds every value (8, 16, 32 bits or a 64-bit float). A WebAssembly tokenizer does the splitting and the dictionary.
- **Flat blocks** (every row an object): one column per key plus one presence bit per row and key, so missing keys cost almost nothing. Columns pick their own coding: delta or zig-zag varints (also for numbers with two decimals), bit-packed offsets, floats, booleans as bits, hex ids and UUIDs as raw bytes, IPv4 as four bytes, a block dictionary, plain strings, or JSON text for anything else. A string column that looks like log lines (long, mostly unique) is also tried as **log templates**: runs of digits and long hex numbers become slots, the rest becomes a template list, and the writer keeps it only when that is at least 5% smaller.
- **Footer**: the block table (offset, length, CRC32, rows, layout), per-block number ranges, flags and an optional raw-line store, itself zstd-compressed, then a 16-byte trailer (footer length, footer CRC32, version, `LFC1`). A reader fetches the last 16 bytes, then the footer, then only the blocks it needs. Unknown optional footer sections are skipped; an unknown *required* one is refused.
- **Worker pool**: a helper does CRC32, zstd and the number columns for a block and sends typed arrays back (transferred, not copied); strings and row objects are made on the calling thread because objects cannot cross threads cheaply. Full row objects are built on the calling thread, so on a 106 MB events file 1 to 4 helpers all took about the same time (laptop: 704, 948, 923 ms; container: about 500 ms each); helpers pay off for packing and for reading only some keys.

## How it compares
**Text columns (0.10.30):** in Chromium and WebKitGTK, a text column whose values are all ASCII (no 0 chars) is written straight to bytes, with no joined string and no TextEncoder pass. Saving a log table took 0.90 of the 0.10.29 time in Chromium 156 and 0.94 in WebKitGTK 2.52.6 (same-page A/B). Firefox keeps the old path, because its TextEncoder is fast. The bytes are identical.

**Against Parquet readers in the browser** (lfc-pack 0.10.35, measured 2026-11-14 on a shared 4-core cloud machine in Chromium 156, Firefox 158 and WebKitGTK 2.52.6; gaps under about 15% are noise). Parquet files are written by pyarrow 26.0.1 with zstd level 3 (whole numbers as int32, so every reader returns plain numbers), and every reader opens that same file. The readers are parquet-wasm 0.9.0 with Arrow JS 21.2.0 and hyparquet 1.33.0 with hyparquet-compressors 1.1.3. The data sets are 100,000 rows each from a fixed seed. DuckDB-WASM was not re-run (it loads a 36 MB WebAssembly file); its 0.10.1 numbers are kept below, marked as such. Every reader returned the same row count and first row. Raw data and the harness: `js-modules-research/readme-reruns-2026.11.14`.

File size, 100,000 rows each, MB (lower is better):

| Data | Parquet zstd 3 | lfc-pack |
|---|---|---|
| Taxi trips, 7 numeric columns | 1.11 | **0.64** |
| Orders, nullable text, dates, money | 1.20 | **0.60** |
| Logs, text, ids, addresses | 0.87 | **0.59** |

lfc-pack files are 0.50 to 0.68 of the Parquet zstd 3 size. These data sets differ from the ones measured on 0.10.1, so the sizes are not comparable row for row with the older table.

Rows as plain JavaScript objects, median of 7 warm reads, ms (lower is better; lfc-pack takes 0.24 to 0.62 of the time of the faster reader, hyparquet, and 0.10 to 0.45 of parquet-wasm's):

| Data | Browser | lfc-pack | parquet-wasm + Arrow JS | hyparquet |
|---|---|---|---|---|
| Logs | Chromium 156 | **53.1** | 348 | 186 |
| | Firefox 158 | **32.0** | 222 | 130 |
| | WebKitGTK 2.52.6 | **35.0** | 166 | 135 |
| Orders | Chromium 156 | **16.9** | 172 | 57.6 |
| | Firefox 158 | **25.0** | 175 | 71.0 |
| | WebKitGTK 2.52.6 | **17.0** | 119 | 71.0 |
| Taxi | Chromium 156 | **37.1** | 93.2 | 60.2 |
| | Firefox 158 | **22.0** | 84.0 | 64.0 |
| | WebKitGTK 2.52.6 | **21.0** | 47.0 | 44.0 |

From here to the end of this comparison the numbers are lfc-pack 0.10.1 from 2026-11-12 on the older data sets, not re-run. DuckDB-WASM 1.33.1 read taxi trips in 147 ms (Chromium 156) and 96 ms (WebKitGTK 2.52.6), orders in 209 and 170 ms, and logs in 373 and 259 ms, and did not run in Firefox 158.

Fresh page to first rows (library start-up plus one read, taxi trips, ms): lfc-pack 81.4 / 53.0 / 79.0 (Chromium 156 / Firefox 158 / WebKitGTK 2.52.6), hyparquet 120 / 118 / 103, parquet-wasm 250 / 262 / 280, DuckDB-WASM 1,716 (Chromium) and 6,155 (WebKitGTK), which loads a 36 MB WebAssembly file.

Rows with one value, 12 equality queries, total ms (0.10.1; taxi `rate`, 5 values; lfc-pack `equals` and, in brackets, with `cache: true`), against the fastest Parquet reader (DuckDB-WASM `SELECT ... WHERE` where it ran, else parquet-wasm filtering the Arrow column):

| Browser | lfc-pack | fastest Parquet reader |
|---|---|---|
| Chromium 156 | **244** (73.2) | 386 (DuckDB-WASM) |
| Firefox 158 | **306** (64.0) | 798 (parquet-wasm, Arrow column filter) |
| WebKitGTK 2.52.6 | **190** (61.0) | 492 (DuckDB-WASM) |

The logs (`ip`) and orders (`cust`) sets give the same order of results: with `cache: true` lfc-pack takes 38 to 68 ms in every browser; without it, 139 to 180 ms. DuckDB-WASM is the closest Parquet reader (Chromium 156: 285 ms on logs `ip` against 170 for lfc-pack; WebKitGTK 2.52.6: 537 against 139). In every cell where it ran, uncached lfc-pack was ahead. Every reader returned the same rows (checked by row count).

Older size comparison (an early version, measured then, not re-run):
Sizes are exact byte counts, the same everywhere. Parquet numbers are from the project's research runs (pyarrow, zstd level 3 unless stated), see `columns-v2` in the LFC-pack research folder.

| Data | Input | lfc-pack 0.1.1 (measured then; not re-run) | Parquet |
|---|---|---|---|
| FHIR resources (Synthea), first 21 MB, 11,448 rows | 20,972,170 | **620,636** | 1,467,703 (zstd 3) |
| same, 260 MB, 140,468 rows | 259,998,467 | **7,708,261** | not measured here |
| same, 757 MB, 409,973 rows, 35 blocks | 757,639,905 | **22,637,152** | 45,140,567 (zstd 3); 38,106,898 (zstd 19, 1M-row groups, dictionary) |
| Made-up web logs, 20,000 rows | 2,305,577 | **262,039** | 343,535 (zstd 19, research set) |
| LogHub HDFS 2k lines as `{"msg": line}` | 309,848 | **37,579** (31% less with templates) | not measured here |

`exact: true` costs size: the 21 MB FHIR file is 727,040 bytes (about 800 rows are spelled `0.0`).

Speed: measured results, each labeled with its browser and machine (the real laptop run against `JSON.parse` and gzip, and cloud runs for each release since), are on the module page under "Speed and efficiency numbers". The browser check `tests/lfc-pack-browser.js` prints pack time, unpack time and `JSON.parse` time for the same rows, and with `FILE=...` the 1, 2, 4 and all-helper times for a real file. Round trips pass in all three test browsers.

## Limits
- WebAssembly is required; there is no plain-JavaScript fallback for zstd.
- Input is NDJSON, one value per line. Blank lines and `\r` are dropped in value mode (kept in `exact` mode). Lines that are not valid JSON make `pack` throw.
- Value mode returns the values `JSON.parse` returns: numbers are doubles (9007199254740993 comes back as 9007199254740992), `1.0` comes back as `1`, `-0` stays `-0`, duplicate keys keep the last value, object keys come back in first-seen order per block (integer-like keys first, as in any JavaScript object).
- Memory: the writer's wasm instance reserves about 400 MB of address space (not all touched) for a 21 MB block; since 0.4.0 `trim()` gives grown memory back after a job, and idle `packParallel` helpers keep theirs until they close, 3 s after the last call (giving it back at once made each call grow it again, 7 to 25% slower); the packer also gives its memory back by itself after 30 s without packing. Blocks are capped at 48 MB, 4 million numbers and 262,144 rows; a block that exceeds the caps is split.
- `rows: 'lazy'` and `'lazycols'` rows are not plain objects: `Object.keys`, spread, `structuredClone` and `postMessage` lose the values (see "Lazy rows").
- Rows are objects; a file of bare numbers or arrays works (nested layout) but gains little.
- **The format is not frozen until a formal release**: files written by 0.x versions may not open in later ones.
- Not built yet: the number-spelling section (smaller `exact` files), a streaming reader, the SQL subset, Parquet and CSV converters, and a command-line tool.

## See it in action

Used right now in Netflow Map (its repository is private, so there is no link), through `packTables` and `unpackTables`. Checked in its shipped file on its main branch on 2026.10.31. The module's own page is `demo.html` in this folder, and `viewer.html` opens any `.json.lfc` file.

## Prior art and credits
Zstandard (Yann Collet and Meta Platforms, BSD-3-Clause) does the compression; the library is compiled unchanged by [zstd-kit](../zstd-kit/README.md)'s `wasm/build.sh` and embedded here (see [NOTICE-zstd.txt](NOTICE-zstd.txt)). The ideas of columns plus a footer with per-block statistics come from Apache Parquet and ORC; the shape-plus-columns split for nested data follows the "shredding" of Dremel (Melnik et al., Google, 2010) and the Parquet and Arrow nesting rules, with a simpler path-hash column naming. Log templates follow the log-parsing line of work (Drain, He et al. 2017; LogHub samples by the Logpai group were used for tests). The code here is written from scratch for this repository.

**Original sources** (links checked 2026-11-14; ideas only unless the section above says code is included):

- [Zstandard](https://facebook.github.io/zstd/) by Yann Collet and Meta Platforms (BSD-3-Clause); format in [RFC 8878](https://www.rfc-editor.org/rfc/rfc8878)
- [XXH64](https://xxhash.com/) by Yann Collet
- CRC-32: W. Wesley Peterson and D. T. Brown, ["Cyclic Codes for Error Detection"](https://doi.org/10.1109/JRPROC.1961.287814), 1961, with lookup tables; the table-per-byte "slicing" speedup: Kounavis and Berry (Intel), ["A Systematic Approach to Building High Performance Software-Based CRC Generators"](https://doi.org/10.1109/ISCC.2005.18), 2005
- [FNV-1a](http://www.isthe.com/chongo/tech/comp/fnv/index.html) by Glenn Fowler, Landon Curt Noll and Kiem-Phong Vo
- LEB128 varints and ZigZag signed numbers as described in the [Protocol Buffers encoding guide](https://protobuf.dev/programming-guides/encoding/) (Google)
- Frame of reference plus bit packing: Goldstein, Ramakrishnan and Shaft, ["Compressing relations and indexes"](https://doi.org/10.1109/ICDE.1998.655800), ICDE 1998; related fast-unpacking work: Lemire and Boytsov, ["Decoding billions of integers per second through vectorization"](https://arxiv.org/abs/1209.2137), 2015
- Columns with per-block min/max statistics: [Apache Parquet](https://parquet.apache.org/) and [Apache ORC](https://orc.apache.org/); zone maps as used by DuckDB ([lightweight compression notes](https://duckdb.org/2022/10/28/lightweight-compression))
- Nested-data shredding: Melnik et al., ["Dremel: Interactive Analysis of Web-Scale Datasets"](https://research.google/pubs/dremel-interactive-analysis-of-web-scale-datasets-2/), Google, 2010
- Branchless select for skipping empty values (B48): Daniel Lemire, ["Mispredicted branches can multiply your running times"](https://lemire.me/blog/2019/10/15/mispredicted-branches-can-multiply-your-running-times/), 2019
- Warming WebAssembly kernels before the first long call (B50): the V8 team, ["WebAssembly Dynamic Tiering ready to try in Chrome 96"](https://v8.dev/blog/wasm-dynamic-tiering), 2021
- Log templates: He, Zhu, Zheng and Lyu, ["Drain: An Online Log Parsing Approach with Fixed Depth Tree"](https://doi.org/10.1109/ICWS.2017.13), ICWS 2017; test samples from LogHub by the Logpai group ([github.com/logpai/loghub](https://github.com/logpai/loghub))

## For AI agents
Load `lfc-pack.js` (global `LfcPack`) or `require` it; call `init()` first and wait for it. Pack once with `pack(text)` and keep the `Uint8Array`. Read with `unpack(file, { keys, range })` when you need a few fields or a time slice (blocks outside the range are never decoded), and with `pool()` for files over a few blocks. Use `exact: true` only when the original bytes must come back. For big saves from row arrays use `packRowsParallel(rows)`, or `packColumnsParallel({ key: array })` when you already hold columns; for big reads of flat tables use `await unpackColumnsParallel(bytes, { keys })`, which gives `{ key: array }` without row objects (all three keep the page responsive and need `init()` first). WebAssembly memory only grows, so after a big job call `trim()` to give back what it grew: the next call starts with fresh, small memory and gives the same results. The sources are `src/*.js` joined by `build.py`; the wasm sources are in `wasm/` (zstd and its JavaScript wrapper come from `../zstd-kit/` (`wasm/build.sh`, `src/zstd-core.js`), `build-core.sh` for the tokenizer and string dictionary); `python/lfc_pack.py` reads files in Python. Run `node test/roundtrip.cjs`, `node test/exact.cjs`, `node test/query.cjs`, `node test/pool.cjs` and `python3 -I test/pyread.py <file.lfc>=<source.ndjson>` after any change.

## Decoder-only build

`lfc-pack-read.js` is the same code with only the 57 KB zstd decoder embedded: 264 KB (92 KB gzipped) against 356 KB (190 KB gzipped) for `lfc-pack.js` (0.4.14; the reader keeps its WebAssembly as plain base64). Use it on pages that only open files. `init()` loads the decoder, `unpack`, `unpackTables`, `info` and the helper pool work as usual, and writing (`pack`, `packRows`, `packTables`) throws. Written by `python3 build.py` next to `lfc-pack.js`.

## Link-list columns

A column whose values are arrays of whole numbers from 0 to 4,294,967,295 (neighbor or link lists) is stored as list lengths plus deltas when the block uses the flat layout. The writer does not pick the flat layout for such rows on its own, because that would make packing slower than 0.1.0: pass `{ block: "flat" }` to `pack`, `packRows` or `packTables` for link-list tables. On 30,000 made-up nodes with out and in lists this was 211,344 bytes against 357,110 before, and reads back value-exact.
