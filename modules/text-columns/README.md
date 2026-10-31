# text-columns

**Version 0.5.1 · API 0**

**Tested in:** Chromium 153, Firefox 158, WebKitGTK 2.52.6 (container, 4 cores)

Part of [JS-modules](../../README.md). MIT License, Copyright (c) 2026 LFC Foundry.

## What it is and how it works

Reads CSV or TSV text straight into typed columns. Decimal columns come out as `Float64Array`, the rest as arrays of strings.

- The field scan runs in WebAssembly with SIMD, 16 bytes at a time, with a JavaScript fallback.
- Numbers are parsed from the bytes, with no string made per cell.
- Row objects are built only if you ask; large files can be read in parallel.

## Why it exists

Usual parsers build a string for every cell and an object for every row, which costs time and memory on big tables. Pages that import a table usually want columns for charts or for [lfc-pack](../lfc-pack/README.md). On the laptop in Firefox 160 it read 200,000 rows in 46 ms against Papa Parse's 158 ms.

**Where it helps**

- Importing large CSV exports into a page.
- Feeding columns to charts and number crunching.
- Converting tables into LFC-pack files.

**Not for:** inputs over about 1.4 GB, or guessing column types by itself (dates and booleans are opt-in).

## Use
```js
var t = TextColumns.parse(bytesOrString, { delimiter: ',', header: true });   // delimiter '\t' for TSV; header false names columns c1, c2, ...
t.names;               // ['id', 'price', 'city']
t.count;               // number of data rows
t.columns[0].values;   // Float64Array for a number column, array of strings otherwise
t.columns[0].type;     // 'number' or 'text'
t.toRows();            // [{ id: 1, price: 2.5, city: 'Oslo' }, ...]
```
Copy `text-columns.js` next to your page (`<script src="text-columns.js"></script>` sets `TextColumns`) or `require` it in Node. Pass bytes when you have them (a fetch result, a file): a string is encoded first.

## Big files: read in parallel (since 0.2.0)
```js
TextColumns.warm(4);                                                   // optional: start the helpers early
var t = await TextColumns.parseParallel(bytes, { workers: 4 });        // same table as parse(); t.workers says how many helpers read it (0 = read directly)
```
The file is cut at line ends outside quotes, each Web Worker reads a piece with this same code, and the columns are joined. Files under 4 MB once the helpers are running (from `warm()` or an earlier call), or under 32 MB before that (`minBytes`), a quote in the middle of a plain field, any error, or no Workers: it reads the file directly, so answers and error messages are the same. Number columns gain most; text columns are bound by making strings on the main thread. Measured with helpers already started, 4 helpers against one thread (ms, lower is better; Firefox 158 / Chromium 155 / WebKitGTK 2.52.6): numbers 152 MB 1,089 / 850 / 524 against 3,032 / 1,524 / 2,821; numbers 45 MB 213 / 196 / 172 against 518 / 322 / 332; text-heavy 61 MB 1,258 / 870 / 736 against 1,622 / 830 / 1,126 (Chromium loses). Starting the helpers costs about 30 to 130 ms the first time, which is why the floor is 32 MB until they run. With helpers running, 4 to 16 MB files take 0.58 to 0.92x the time in Firefox 158 and WebKitGTK 2.52.6 and 0.62 to 0.87x in Chromium 153 (one 7.8 MB mixed file 1.23x); container, 4 cores.

## Only what you need: `columns` and `lazy` (since 0.3.0)
```js
var t = TextColumns.parse(bytes, { columns: ['price', 'city'] });   // names or 0-based numbers; the result holds just these, in file order
var f = TextColumns.parse(bytes, { columns: function (name, i) { return name !== 'notes'; } });   // or a yes/no function (since 0.4.0)
var u = TextColumns.parse(bytes, { lazy: true });                    // text columns cut their strings when .values is first read
u.columns[3].get(41);                                                // one cell, without cutting the whole column
```
Dates and booleans are opt-in (since 0.5.0): `{ types: { when: 'date', ok: 'boolean' } }` turns `YYYY-MM-DD` fields into milliseconds since 1970 UTC (a `Float64Array`, type `'date'`) and `true`/`false` (also `TRUE`/`FALSE`, `True`/`False`) into booleans (type `'boolean'`). One field that does not fit, or an impossible date such as 2023-02-29, leaves that column as text. Without `types`, output is exactly what it was.

A column you do not ask for is never turned into numbers or strings. A lazy text column keeps where its fields are (about 9 bytes a row) and a reference to your input bytes, so do not change those bytes until you have read what you need; the values you get are exactly what `parse` returns. Both options work in `parseParallel` too (a big file with a lazy text column returns almost at once, because no string is made by the main thread). A missing name or number throws an error that says which.

## Rules
- A column is a **number column** only when every field is a plain decimal of at most 15 digits, such as `-12` or `3.25`, with no leading zero (`007` stays text), no exponent (`1e5` stays text), no spaces and no empty field. Then the numbers are exactly what `Number()` gives for the same text. One field that does not fit keeps the whole column as text, so nothing is guessed.
- Quoted fields work: `"a,b"`, `"say ""hi"""`, line breaks inside quotes. `\r\n` and `\n` line ends work; blank lines are skipped; a leading byte-order mark is dropped. The last line needs no line end.
- Every row must have the same number of fields as the first row. A ragged file, text after a closing quote, or a quote that never closes throws an error with a plain message.
- `plain: true` in the options forces the JavaScript path (used by the tests).
- The WebAssembly memory grows to fit the biggest file you read and stays that size; the returned columns do not point into it.

## How it compares
200,000 rows by 6 columns (3 number columns, 3 text columns), 7.4 MB, from bytes, medians in milliseconds, lower is better. Measured in the cloud container, one browser at a time, taking turns, not noise-guarded; browser versions: Firefox 158, ungoogled Chromium 155, WebKitGTK 2.52.6.

| What | Firefox | Chromium | WebKitGTK |
|---|---:|---:|---:|
| text-columns, columns out (WebAssembly SIMD) | 48 | 38 | 39 |
| text-columns, columns out (plain JavaScript path) | 109 | 99 | 87 |
| split lines, split cells, `Number()` by hand | 100 | 174 | 157 |
| text-columns, row objects out (`toRows()`) | 103 | 93 | 62 |
| d3-dsv 3.0.1 `csvParse` with `autoType` (row objects) | 213 | 192 | 234 |
| Papa Parse 5.4.1 with `header` and `dynamicTyping` (row objects) | 339 | 440 | 382 |

Papa Parse and d3-dsv are fuller parsers (type guessing for dates and booleans, streaming, error recovery, other delimiters); text-columns does less on purpose. Numbers on a laptop: not measured yet.

## Limits
- One-character delimiter below 128 other than a quote or a line break.
- No type guessing beyond plain decimals; no dates, booleans or streaming.
- Input over about 1.4 GB is not supported.

## Prior art and credits
The idea of finding structural characters with SIMD compares is from simdjson and simdcsv (Langdale, Lemire and others). This module is a small independent implementation in C compiled to WebAssembly; no code was copied. Papa Parse (MIT) and d3-dsv (ISC) were used only as timing comparisons.

## For AI agents
Source of the scanner: `wasm/tc.c`; build with `sh wasm/build.sh`, embed with `python3 wasm/embed.py` (both check modes exist). Checks: `node modules/text-columns/test/run.js`. The two kernels (`scan`, `numcol`) exist twice, in C and in JavaScript, with the same rules; change both.
