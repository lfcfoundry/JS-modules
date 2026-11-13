# lfc-pack

**Version 0.10.3 · API 0**

**Tested in:** Firefox 158, ungoogled Chromium 156, WebKitGTK 2.52.6

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
| `level: 19` | the archive setting: slower to write (about 15x), about 12% smaller. Default is 3. |
| `block: 'nested' \| 'flat'` | force one layout. Default: each block is written as nested columns and, when it could win, as flat columns too, and the smaller one is kept. |
| `blockBytes` | block size, default 13 MB (faster parallel pack than 21 MB, same size). |
| `share: true` | shared string and shape tables for nested blocks: a string or row shape seen again in a later block is kept once in the footer. Smaller files with small blocks (100,000 GeoJSON points: -17% at 32 KB blocks, -12% at 256 KB); about the same at the default block size (a few hundred bytes either way). `packParallel` packs on one thread with it. Off by default. |
| `paths: false` | switch off per-path strings for nested blocks (on by default): each string path (`.properties.name`, `.items[].sku`) keeps its own dictionary run and repeat numbers, which are small and compress well. 100,000 GeoJSON points -11% at the default block size, -14% at 256 KB blocks; 100,000 orders -6% and -5%. Each block keeps whichever layout is smaller. With `share: true` too (stacked): 256 KB blocks GeoJSON -22%, orders -4%. Pack and read speed within noise of the old layout in Chromium, Firefox and WebKit. |
| `paths: 'auto'` | same as the default since 0.4.6 (kept so older code still works). Each big nested block keeps per-path strings unless the string text they would store twice is more than 11% of the block's text; then it uses the plain layout. This helps records with many paths that each hold few strings, like FHIR: 48 MB of real FHIR is 6% smaller, and all 260 MB is 12% smaller and reads 13 to 22% faster. There is no trial or sample, so pack and packParallel write the same bytes. |
| `access: 'random'` | the read-friendly preset: 256 KB blocks plus `share: true` (options given next to it win; per-path strings are on as everywhere). Reading 100 rows with `unpackRows` decodes one small block (20 to 60 times faster in tests); files 4 to 10% larger than at the default block size (GeoJSON and orders +10%, three flat test sets +4 to +5%). `'whole'` (default) changes nothing. |
| `templates: false` | switch the automatic log templates off. |

Reading:

```js
// only these keys (flat blocks never decode the others)
LfcPack.unpack(file, { keys: ['ts', 'status'] });
// rows whose number is in range; blocks outside it are not opened
LfcPack.unpack(file, { range: { key: 'ts', min: 1760000000, max: 1760003600 } });
// rows where one key equals a value (strict ===; a missing key never matches null); same rows and key order as unpack(file).filter(...), without building the other rows
LfcPack.unpack(file, { equals: { key: 'level', value: 'ERROR' } });
// anyOf (since 0.10.2): several values in one pass, rows in file order, a missing key never matches; 5 values take about a third of the time of 5 separate calls
LfcPack.unpack(file, { equals: { key: 'level', anyOf: ['WARN', 'ERROR', 'FATAL'] } });
// asking again and again on the same file bytes: cache: true keeps what the first query decoded (up to LfcPack.cacheLimit(), 64 MB by default, least recently used blocks go first)
LfcPack.unpack(file, { equals: { key: 'level', value: 'WARN' }, cache: true });
LfcPack.clearCache();   // drop everything the cache holds (LfcPack.cacheBytes() says how much)
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
// array of objects -> file bytes
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

Metadata: `pack`, `packStream` and `packParallel` take an optional `meta` object (a small JSON-able note about the file, kept in its own footer section that older readers skip). `LfcPack.metadata(bytes)` reads it back without decoding any block; in Python use `lfc_pack.metadata(path)`. See `SECTIONS.md`.

Workers: `LfcPack.packBlock(chunk, opts)` packs one chunk of whole lines on its own (run it in any worker; the result is plain bytes), and `packStream(opts).pushPacked(bytes)` appends those chunks in text order on the main thread. Cut the chunks where `push` would: at the first line end at or after `blockBytes` (the last chunk may be shorter). The file is byte for byte the one `push` gives. `share` and `exact` are not supported here. Two workers took 0.60-0.74x the time of `push` on the main thread for 33 MB (Chromium 155, Firefox 158, WebKitGTK 2.52.6); one worker is slower than `push`. Check: `tests/lfc-pack-packblock-browser.js`.

Text that arrives in pieces (since 0.8.0): `const ps = LfcPack.packParallelStream({ workers: 3 })`, then `ps.push(bytes)` for each piece (a parser's output, a download chunk; you may reuse your buffer right after the call) and `const file = await ps.finish()`. Blocks are cut where `pack` cuts them and go to helper Web Workers at once, so packing runs while the rest of the text is still being read. The file is byte for byte the one `pack` writes. `share` and `exact` are not supported. It pays on big inputs: 99 MB of 5-column rows pushed in 64 KB pieces took 0.65 to 0.82 (Chromium 156), 0.70 to 0.77 (Firefox 158) and 1.09 to 1.20 (WebKitGTK 2.52.6, slower) of the time `pack` takes on the main thread (two runs of 3 paired rounds, 3 workers, 4-core cloud machine, text already in memory, so no overlap with a parser is counted); for 33 MB it was no faster, so use `pack` for small inputs. Check: `tests/lfc-pack-stream-browser.js`.

Reading part of a file: `LfcPack.unpackRows(bytes, { from, count })` decodes only the blocks that hold those rows, `LfcPack.stats(bytes)` reads per-column facts from the footer, and `LfcPack.hash(bytes, kind)` gives `'crc32'` or `'xxh64'`.

Files too big to hold in memory (since 0.5.0): `const R = await LfcPack.open(file)` takes a `File` or `Blob` (or a function `read(offset, length)` with its `size` set, or bytes) and reads only the 16-byte trailer and the footer. Then `await R.rows({ from, count, table })` and `await R.block(i)` fetch just the byte ranges of the blocks they need and give the same rows as `unpackRows`; `R.info`, `R.meta` and `R.blocks` (`{ offset, length, rows, kind, table, first }`) describe the file. Memory is bounded by the footer and one block. Saves of more than 4 MiB of text start with a 64 KiB first block (since 0.10.2), so a viewer shows its first rows at once. Files with raw blocks (byte-exact text that is not plain rows) are still read whole on the first call. Each block is checked against its checksum when it is read. Since 0.5.9 the reader adds two calls for column work:

- `await R.columns(i, { keys })` gives block `i` as typed columns, the same entry `unpackColumns` gives for that block, while fetching only that block. It works on flat-row blocks only; nested and raw blocks throw and are read with `R.block(i)`.
- `R.readAhead()` (since 0.10.2, opt-in): call it after showing the first rows; when the page is idle it reads and decodes the next block that has not been read, so the next big read does not pay the browser's warm-up. One block per call, one at a time. It returns a promise: `true` when it read a block, `false` for a raw-block file, a file already fully read, or an error (it is only a hint).
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
Zstandard (Yann Collet and Meta Platforms, BSD-3-Clause) does the compression; the library is compiled unchanged by `wasm/build.sh` (see [NOTICE-zstd.txt](NOTICE-zstd.txt)). The ideas of columns plus a footer with per-block statistics come from Apache Parquet and ORC; the shape-plus-columns split for nested data follows the "shredding" of Dremel (Melnik et al., Google, 2010) and the Parquet and Arrow nesting rules, with a simpler path-hash column naming. Log templates follow the log-parsing line of work (Drain, He et al. 2017; LogHub samples by the Logpai group were used for tests). The code here is written from scratch for this repository.

## For AI agents
Load `lfc-pack.js` (global `LfcPack`) or `require` it; call `init()` first and wait for it. Pack once with `pack(text)` and keep the `Uint8Array`. Read with `unpack(file, { keys, range })` when you need a few fields or a time slice (blocks outside the range are never decoded), and with `pool()` for files over a few blocks. Use `exact: true` only when the original bytes must come back. WebAssembly memory only grows, so after a big job call `trim()` to give back what it grew: the next call starts with fresh, small memory and gives the same results. The sources are `src/*.js` joined by `build.py`; the wasm sources are in `wasm/` (`build.sh` for zstd, `build-core.sh` for the tokenizer and string dictionary); `python/lfc_pack.py` reads files in Python. Run `node test/roundtrip.cjs`, `node test/exact.cjs`, `node test/query.cjs`, `node test/pool.cjs` and `python3 -I test/pyread.py <file.lfc>=<source.ndjson>` after any change.

## Decoder-only build

`lfc-pack-read.js` is the same code with only the 57 KB zstd decoder embedded: 264 KB (92 KB gzipped) against 356 KB (190 KB gzipped) for `lfc-pack.js` (0.4.14; the reader keeps its WebAssembly as plain base64). Use it on pages that only open files. `init()` loads the decoder, `unpack`, `unpackTables`, `info` and the helper pool work as usual, and writing (`pack`, `packRows`, `packTables`) throws. Written by `python3 build.py` next to `lfc-pack.js`.

## Link-list columns

A column whose values are arrays of whole numbers from 0 to 4,294,967,295 (neighbor or link lists) is stored as list lengths plus deltas when the block uses the flat layout. The writer does not pick the flat layout for such rows on its own, because that would make packing slower than 0.1.0: pass `{ block: "flat" }` to `pack`, `packRows` or `packTables` for link-list tables. On 30,000 made-up nodes with out and in lists this was 211,344 bytes against 357,110 before, and reads back value-exact.
