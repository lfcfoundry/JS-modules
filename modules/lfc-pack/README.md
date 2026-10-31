# lfc-pack

**Version 0.3.1 · API 0**

**Tested in:** Chromium 153, Firefox 158, WebKitGTK 2.52.6, Node 22 (container)

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
  LfcPack.init().then(function () {                    // loads the wasm once (init({ readOnly: true }) if you only read)
    var file = LfcPack.pack(ndjsonText);               // string, Uint8Array or Buffer -> Uint8Array (the .json.lfc bytes)
    var rows = LfcPack.unpack(file);                   // array of row objects, same values as JSON.parse of each line
    LfcPack.info(file);                                // { rows, blocks, size, major, minor }
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
| `paths: false` | switch off per-path strings for nested blocks (on by default): each string path (`.properties.name`, `.items[].sku`) keeps its own dictionary run and repeat numbers, which are small and compress well. 100,000 GeoJSON points -11% at the default block size, -14% at 256 KB blocks; 100,000 orders -6% and -5%. Each block keeps whichever layout is smaller. With `share: true` too (stacked): 256 KB blocks GeoJSON -19%, orders -7%, about the size of default-size files without it. Pack and read speed within noise of the old layout in Chromium, Firefox and WebKit. |
| `access: 'random'` | the read-friendly preset: 256 KB blocks plus `share: true` (options given next to it win; per-path strings are on as everywhere). Reading 100 rows with `unpackRows` decodes one small block (20 to 60 times faster in tests); files about the size of the default block size (GeoJSON +14%, orders +6% against the default with per-path strings; three flat test sets +4 to +5%). `'whole'` (default) changes nothing. |
| `templates: false` | switch the automatic log templates off. |

Reading:

```js
LfcPack.unpack(file, { keys: ['ts', 'status'] });                         // only these keys (flat blocks never decode the others)
LfcPack.unpack(file, { range: { key: 'ts', min: 1760000000, max: 1760003600 } });   // rows whose number is in range; blocks outside it are not opened
LfcPack.unpackText(file);                                                 // Uint8Array of NDJSON text (exact if packed with exact: true)
LfcPack.packParallel(bytes, { workers: 4 }).then(function (file) { /* opt-in: same file bytes as pack(), blocks packed by helper Web Workers (max min(cores, 8)); exact mode and small inputs stay on one thread */ });
LfcPack.pool({ workers: 3 }).then(function (pool) {                       // helper Web Workers do the byte work; rows are built on the calling thread; without workers you get 2 (at 105 MB more helpers did not help in Chromium and slowed Firefox)
  return pool.unpack(file).then(function (rows) { pool.close(); return rows; });   // same options as unpack
});
```

Row objects in, row objects out (no NDJSON text), and whole documents made of several tables plus plain values (a map with nodes, links, states and view settings):

```js
var bytes = LfcPack.packRows([{ id: 1, name: 'a' }, { id: 2 }]);        // array of objects -> file bytes
var rows = LfcPack.unpack(bytes);                                       // the same rows back
var file = LfcPack.packTables({ nodes: nodes, links: links, states: states, view: { zoom: 2.5 }, title: 'My map' });   // arrays become tables, other values are kept as they are
var map = LfcPack.unpackTables(file);                                   // { nodes, links, states, view, title }, value-exact (JSON values only: -0 becomes 0, undefined and NaN are lost, as with JSON.stringify)
LfcPack.unpackTables(file, { keys: ['id'] });                           // same options as unpack, per table
```

Works under a page policy of `script-src 'wasm-unsafe-eval'` and `worker-src blob:` only: no `eval`, no `new Function`, no remote scripts (the helper workers start from a blob made of this file).

Metadata: `pack`, `packStream` and `packParallel` take an optional `meta` object (a small JSON-able note about the file, kept in its own footer section that older readers skip). `LfcPack.metadata(bytes)` reads it back without decoding any block; in Python use `lfc_pack.metadata(path)`. See `SECTIONS.md`.

Reading part of a file: `LfcPack.unpackRows(bytes, { from, count })` decodes only the blocks that hold those rows, `LfcPack.stats(bytes)` reads per-column facts from the footer, and `LfcPack.hash(bytes, kind)` gives `'crc32'` or `'xxh64'`. `viewer.html` is a single-file viewer for `.json.lfc` files (open it in a browser and drop a file on it).

Specs: `SPEC.md` (container), `LAYOUT-SPEC.md` (flat and nested block layouts) and `INTEROP.md` (what every reader must agree on, with test vectors in `vectors/`). The Go reader in `go-reader/` is built from them.

Python (needs `pip install zstandard`, or Python 3.14): `python/lfc_pack.py` gives `read(path)`, `read_tables(path)`, `read_text(path)` and `info(path)`, with the same values.

Python writer: `python/lfc_pack_write.py` has `write(src, dst, level=3, exact=False)`, `pack(ndjson_bytes)`, `pack_rows(list)` and `pack_exact(ndjson_bytes, level, mode)` (mode `"lines"` or `"spelling"`). It writes nested and flat blocks and link-list columns, values exact (numbers are doubles); files open in `lfc-pack.js` and `lfc_pack.py`. No log templates, no helper-worker splitting. A block never ends up larger than plain zstd of its lines.

## How the file is laid out
- **Nested blocks** (any JSON): each row is split into a *shape* (its keys, nesting and value kinds) and its values. Rows with the same shape share one entry. Strings of the block go into one dictionary (each distinct string once, rows hold small codes); numbers and booleans go into one column per path (`.actor.id`, `.payload.commits[].sha`), stored at the narrowest width that holds every value (8, 16, 32 bits or a 64-bit float). A WebAssembly tokenizer does the splitting and the dictionary.
- **Flat blocks** (every row an object): one column per key plus one presence bit per row and key, so missing keys cost almost nothing. Columns pick their own coding: delta or zig-zag varints (also for numbers with two decimals), bit-packed offsets, floats, booleans as bits, hex ids and UUIDs as raw bytes, IPv4 as four bytes, a block dictionary, plain strings, or JSON text for anything else. A string column that looks like log lines (long, mostly unique) is also tried as **log templates**: runs of digits and long hex numbers become slots, the rest becomes a template list, and the writer keeps it only when that is at least 5% smaller.
- **Footer**: the block table (offset, length, CRC32, rows, layout), per-block number ranges, flags and an optional raw-line store, itself zstd-compressed, then a 16-byte trailer (footer length, footer CRC32, version, `LFC1`). A reader fetches the last 16 bytes, then the footer, then only the blocks it needs. Unknown optional footer sections are skipped; an unknown *required* one is refused.
- **Worker pool**: a helper does CRC32, zstd and the number columns for a block and sends typed arrays back (transferred, not copied); strings and row objects are made on the calling thread because objects cannot cross threads cheaply. Full row objects are built on the calling thread, so on a 106 MB events file 1 to 4 helpers all took about the same time (laptop: 704, 948, 923 ms; container: about 500 ms each); helpers pay off for packing and for reading only some keys.

## How it compares
Sizes are exact byte counts, the same everywhere. Parquet numbers are from the project's research runs (pyarrow, zstd level 3 unless stated), see `columns-v2` in the LFC-pack research folder.

| Data | Input | lfc-pack 0.1.1 | Parquet |
|---|---|---|---|
| FHIR resources (Synthea), first 21 MB, 11,448 rows | 20,972,170 | **620,636** | 1,467,703 (zstd 3) |
| same, 260 MB, 140,468 rows | 259,998,467 | **7,708,261** | not measured here |
| same, 757 MB, 409,973 rows, 35 blocks | 757,639,905 | **22,637,152** | 45,140,567 (zstd 3); 38,106,898 (zstd 19, 1M-row groups, dictionary) |
| Made-up web logs, 20,000 rows | 2,305,577 | **262,039** | 343,535 (zstd 19, research set) |
| LogHub HDFS 2k lines as `{"msg": line}` | 309,848 | **37,579** (31% less with templates) | not measured here |

`exact: true` costs size: the 21 MB FHIR file is 727,040 bytes (about 800 rows are spelled `0.0`).

Speed: the browser check `tests/lfc-pack-browser.js` prints pack time, unpack time and `JSON.parse` time for the same rows, and with `FILE=...` the 1, 2, 4 and all-helper times for a real file. The numbers published for a release must come from a run that passes the noise guard; this version has not had one yet, so none are quoted. Round trips pass in all three test browsers.

## Limits
- WebAssembly is required; there is no plain-JavaScript fallback for zstd.
- Input is NDJSON, one value per line. Blank lines and `\r` are dropped in value mode (kept in `exact` mode). Lines that are not valid JSON make `pack` throw.
- Value mode returns the values `JSON.parse` returns: numbers are doubles (9007199254740993 comes back as 9007199254740992), `1.0` comes back as `1`, `-0` stays `-0`, duplicate keys keep the last value, object keys come back in first-seen order per block (integer-like keys first, as in any JavaScript object).
- Memory: the writer's wasm instance reserves about 400 MB of address space (not all touched) for a 21 MB block; shrinking this is planned. Blocks are capped at 48 MB, 4 million numbers and 262,144 rows; a block that exceeds the caps is split.
- Rows are objects; a file of bare numbers or arrays works (nested layout) but gains little.
- **The format is not frozen until a formal release**: files written by 0.x versions may not open in later ones.
- Not built yet: the number-spelling section (smaller `exact` files), a streaming reader, the SQL subset, Parquet and CSV converters, and a command-line tool.

## Prior art and credits
Zstandard (Yann Collet and Meta Platforms, BSD-3-Clause) does the compression; the library is compiled unchanged by `wasm/build.sh` (see [NOTICE-zstd.txt](NOTICE-zstd.txt)). The ideas of columns plus a footer with per-block statistics come from Apache Parquet and ORC; the shape-plus-columns split for nested data follows the "shredding" of Dremel (Melnik et al., Google, 2010) and the Parquet and Arrow nesting rules, with a simpler path-hash column naming. Log templates follow the log-parsing line of work (Drain, He et al. 2017; LogHub samples by the Logpai group were used for tests). The code here is written from scratch for this repository.

## For AI agents
Load `lfc-pack.js` (global `LfcPack`) or `require` it; call `init()` first and wait for it. Pack once with `pack(text)` and keep the `Uint8Array`. Read with `unpack(file, { keys, range })` when you need a few fields or a time slice (blocks outside the range are never decoded), and with `pool()` for files over a few blocks. Use `exact: true` only when the original bytes must come back. The sources are `src/*.js` joined by `build.py`; the wasm sources are in `wasm/` (`build.sh` for zstd, `build-core.sh` for the tokenizer and string dictionary); `python/lfc_pack.py` reads files in Python. Run `node test/roundtrip.cjs`, `node test/exact.cjs`, `node test/query.cjs`, `node test/pool.cjs` and `python3 -I test/pyread.py <file.lfc>=<source.ndjson>` after any change.

## Decoder-only build

`lfc-pack-read.js` is the same code with only the 57 KB zstd decoder embedded: 143 KB (51 KB gzipped) against 671 KB (214 KB gzipped) for `lfc-pack.js`. Use it on pages that only open files. `init()` loads the decoder, `unpack`, `unpackTables`, `info` and the helper pool work as usual, and writing (`pack`, `packRows`, `packTables`) throws. Written by `python3 build.py` next to `lfc-pack.js`.

## Link-list columns

A column whose values are arrays of whole numbers from 0 to 4,294,967,295 (neighbor or link lists) is stored as list lengths plus deltas when the block uses the flat layout. The writer does not pick the flat layout for such rows on its own, because that would make packing slower than 0.1.0: pass `{ block: "flat" }` to `pack`, `packRows` or `packTables` for link-list tables. On 30,000 made-up nodes with out and in lists this was 211,344 bytes against 357,110 before, and reads back value-exact.
