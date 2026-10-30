# text-columns

**Version 0.3.0 · API 0**

**Tested in:** Firefox 158, ungoogled Chromium 155, WebKitGTK 2.52.6

Reads CSV or TSV text into typed columns. A column of plain decimals (-12, 3.25) comes out as a `Float64Array` parsed straight from the bytes, with no string made for any number; every other column comes out as an array of strings. The field scan runs in WebAssembly with SIMD (16 bytes at a time) and falls back to plain JavaScript with the same answers.

Part of [JS-modules](../../README.md). MIT License, Copyright (c) 2026 LFC Foundry.

## Why it exists
Importing a big table is mostly splitting text and turning digits into numbers. The usual parsers build a string for every cell and often an object for every row, so a 200,000-row file costs a few hundred milliseconds and a pile of garbage. Pages that import a table (a map's rows, a log, an export) usually want columns they can hand to a number-crunching step or to [lfc-pack](../lfc-pack/README.md), not row objects. This module goes from bytes to columns in one pass and builds row objects only if you ask.

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
The file is cut at line ends outside quotes, each Web Worker reads a piece with this same code, and the columns are joined. Files under 32 MB (`minBytes`), a quote in the middle of a plain field, any error, or no Workers: it reads the file directly, so answers and error messages are the same. Number columns gain most; text columns are bound by making strings on the main thread. Measured with helpers already started, 4 helpers against one thread (ms, lower is better; Firefox 158 / Chromium 155 / WebKitGTK 2.52.6): numbers 152 MB 1,089 / 850 / 524 against 3,032 / 1,524 / 2,821; numbers 45 MB 213 / 196 / 172 against 518 / 322 / 332; text-heavy 61 MB 1,258 / 870 / 736 against 1,622 / 830 / 1,126 (Chromium loses). Starting the helpers costs about 30 to 60 ms the first time.

## Only what you need: `columns` and `lazy` (since 0.3.0)
```js
var t = TextColumns.parse(bytes, { columns: ['price', 'city'] });   // names or 0-based numbers; the result holds just these, in file order
var u = TextColumns.parse(bytes, { lazy: true });                    // text columns cut their strings when .values is first read
u.columns[3].get(41);                                                // one cell, without cutting the whole column
```
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
