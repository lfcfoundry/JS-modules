# text-columns

**Version 0.8.0 · API 0**

**Tested in:** Firefox 158, ungoogled Chromium 156, WebKitGTK 2.52.6

Part of [JS-modules](../../README.md). MIT License, Copyright (c) 2026 LFC Foundry.

## What it is and how it works

Reads CSV or TSV text straight into typed columns. Decimal columns come out as `Float64Array`, the rest as arrays of strings.

- The field scan runs in WebAssembly with SIMD, 16 bytes at a time, with a JavaScript fallback.
- Numbers are parsed from the bytes, with no string made per cell.
- Row objects are built only if you ask; large files can be read in parallel.

## Why it exists

Usual parsers build a string for every cell and an object for every row, which costs time and memory on big tables. Pages that import a table usually want columns for charts or for [lfc-pack](../lfc-pack/README.md). On real 8 MB files (retail, SEC and SBA tables) in the three test browsers it is 0.94 to 4.9 times as fast as Papa Parse with typed rows: SEC numbers 1.8 to 4.9 times, retail 1.0 to 1.9 times, and the 116-column SBA text file 1.2 to 1.5 times, except in Firefox where Papa Parse is 6% faster.

On real files (8 MB slices of public CSV and TSV files, Papa Parse given the decoded text with `header` and `dynamicTyping`), 0.8.0 is 2.1 to 5.8 times faster than Papa Parse in all three test browsers, including wide text files and files with accents, where 0.7.1 was barely ahead or behind. Text that is not plain ASCII is now decoded once and cut into substrings, instead of one decoder call per field.

| Real file (8 MB slice) | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| Online retail invoices, 8 columns, Latin-1 | 5.0x | 5.8x | 3.7x |
| SEC financial statement numbers (TSV), 10 columns | 5.4x | 4.9x | 4.6x |
| SBA assistance awards, 116 columns, mostly text | 3.6x | 2.9x | 2.1x |
| NFL play by play, 372 columns | 4.7x | 5.5x | 5.4x |
| Airport codes, quoted fields | 2.9x | 2.6x | 2.6x |
| World cities (UTF-8 and Latin-1 copies) | 3.7 to 4.0x | 3.9 to 4.7x | 2.4 to 2.6x |

Time Papa Parse takes divided by time text-columns takes (higher is better); median of 5 to 9 runs on one page per browser. Papa Parse 5.4.1 from npm.

**Where it helps**

- Importing large CSV exports into a page.
- Feeding columns to charts and number crunching.
- Converting tables into LFC-pack files.

**Not for:** inputs over about 1.4 GB, or guessing column types by itself (dates and booleans are opt-in).

## Use
```js
var t = TextColumns.parse(bytesOrString);   // comma-separated with a header row; { delimiter: '\t', header: false } for TSV, or no header (columns are then c1, c2, ...)
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
var t = await TextColumns.parseParallel(input.files[0]);              // since 0.6.0: a picked File (or any Blob); each helper reads its own piece of the file
```
The file is cut at line ends outside quotes, each Web Worker reads a piece with this same code, and the columns are joined. Files under 4 MB once the helpers are running (from `warm()` or an earlier call), or under 32 MB before that (`minBytes`), a quote in the middle of a plain field, any error, or no Workers: it reads the file directly, so answers and error messages are the same. Number columns gain most; text columns are bound by making strings on the main thread. Measured with helpers already started, 4 helpers against one thread (ms, lower is better; Firefox 158 / Chromium 155 / WebKitGTK 2.52.6): numbers 152 MB 1,089 / 850 / 524 against 3,032 / 1,524 / 2,821; numbers 45 MB 213 / 196 / 172 against 518 / 322 / 332; text-heavy 61 MB 1,258 / 870 / 736 against 1,622 / 830 / 1,126 (Chromium loses). Starting the helpers costs about 30 to 130 ms the first time, which is why the floor is 32 MB until they run. With helpers running, 4 to 16 MB files take 0.58 to 0.92x the time in Firefox 158 and WebKitGTK 2.52.6 and 0.62 to 0.87x in Chromium 153 (one 7.8 MB mixed file 1.23x); container, 4 cores.

Since 0.7.0, `parseParallel(input, { onPiece(piece) })` hands each piece over as soon as its helper answers: `piece` is `{ index, count, names, columns: [{ type, values }] }` (`names` only for piece 0; number columns are `Float64Array`s, text values are built when first read, so read them inside the call). It is a first guess for a first picture: the returned table settles columns that are numbers in one piece and text in another, and `{ reset: true }` means the file is being read again, so drop what you were given. Each helper copies its number columns for the page for this, so the whole read takes about 0 to 10% longer than without `onPiece` (Chromium 156 about the same, Firefox 158 +10%, WebKitGTK 2.52.6 +1%, 15 MB); without it nothing changes.

Since 0.5.2, a piece with non-ASCII text (accents, emoji) is decoded once inside its helper, which sends the piece's text as one string plus where each field sits in it; the page only cuts substrings instead of decoding every field. Plain-ASCII files are unchanged. `tests/text-columns-utf16-browser.js` checks the same answers as `parse()` in 56 cases (accents, emoji, quotes, CRLF, `columns`, `lazy`, a column that is numbers in one piece and text in another, a piece that is not valid UTF-8).

Since 0.6.0, `parseParallel` also takes a File or Blob, such as one picked with `<input type=file>`. Each helper reads its own piece straight from the file (`blob.slice`), so the page never reads or holds the whole file (about half the memory) and nothing is copied to the helpers; a file whose cuts land inside quoted fields is read again the 0.5.2 way, and a small file is read on the page as before. `tests/text-columns-file-browser.js` checks the same answers as `parse()` in 384 cases (quotes, line breaks inside quotes, an unclosed quote, a byte order mark, CRLF, no final line end, a ragged row, a 300 KB line, `columns`, `lazy`, `types`, numbers in one piece and text in another, a piece that is not valid UTF-8, 3 to 7 helpers).

Since 0.6.1, the helpers also join the number columns: the page makes each full-length column once and the columns travel through the helpers in groups (each helper copies its own rows into a different group at each turn), so the page no longer copies tens of megabytes in one block. Same answers as `parse()` in 576 cases per browser.

Since 0.6.2, the page builds the text columns in short steps of about 4 ms with a break between them, so a big text file no longer holds the page in one long block. Inputs of 8 MB or more are read in pieces of about 4 MB (cut after a line end outside quote marks), so the scanner's WebAssembly memory stays near 10 MB instead of about 3.7 times the file. Same answers: a column that is numbers in one piece and text in another is read again as text. `TextColumns.idleTrim(ms, keep)` (off by default) gives grown memory back after a quiet spell, keeping `keep` bytes ready.


## Only what you need: `columns` and `lazy` (since 0.3.0)
```js
var t = TextColumns.parse(bytes, { columns: ['price', 'city'] });   // names or 0-based numbers; the result holds just these, in file order
var f = TextColumns.parse(bytes, { columns: function (name, i) { return name !== 'notes'; } });   // or a yes/no function (since 0.4.0)
var u = TextColumns.parse(bytes, { lazy: true });                    // text columns cut their strings when .values is first read
u.columns[3].get(41);                                                // one cell, without cutting the whole column
```
Dates and booleans are opt-in (since 0.5.0): `{ types: { when: 'date', ok: 'boolean' } }` turns `YYYY-MM-DD` fields into milliseconds since 1970 UTC (a `Float64Array`, type `'date'`) and `true`/`false` (also `TRUE`/`FALSE`, `True`/`False`) into booleans (type `'boolean'`). One field that does not fit, or an impossible date such as 2023-02-29, leaves that column as text. Without `types`, output is exactly what it was.

A column you do not ask for is never turned into numbers or strings. A lazy text column keeps where its fields are (about 9 bytes a row) and a reference to your input bytes, so do not change those bytes until you have read what you need; the values you get are exactly what `parse` returns. Both options work in `parseParallel` too (a big file with a lazy text column returns almost at once, because no string is made by the main thread). A missing name or number throws an error that says which.

## Repeated values kept once (since 0.6.3)

A text column that repeats a few values (a city, a status) used to hold one string per row. Right after `parse()` or `parseParallel()` returns, the page now merges the repeats into one string per value, in slices of about 4 ms when it is idle, so the parse itself is not slower. Each column decides from its first 2,048 rows (at most one different value per 8 rows). The values stay exactly the same. A 16 MB file keeps 42 to 63% less memory in Chromium (29.4 to 10.9 MB with repeating columns, 25.6 to 15.0 MB with one mostly unique column). The merge takes 35 to 160 ms in Firefox and WebKitGTK, and up to about a second of idle time in Chromium. `_shareLater: false` skips it.

## Rules
- A column is a **number column** only when every field is a plain decimal of at most 15 digits, such as `-12` or `3.25`, with no leading zero (`007` stays text), no exponent (`1e5` stays text), no spaces and no empty field. Then the numbers are exactly what `Number()` gives for the same text. One field that does not fit keeps the whole column as text, so nothing is guessed.
- Quoted fields work: `"a,b"`, `"say ""hi"""`, line breaks inside quotes. `\r\n` and `\n` line ends work; blank lines are skipped; a leading byte-order mark is dropped. The last line needs no line end.
- Every row must have the same number of fields as the first row. A ragged file, text after a closing quote, or a quote that never closes throws an error with a plain message.
- `plain: true` in the options forces the JavaScript path (used by the tests).
- The WebAssembly memory grows to fit the biggest file you read and stays that size; the returned columns do not point into it.

## How it compares
Three real tables, the first 8 MB of each, from bytes, medians of 5 runs in a fresh page, milliseconds, lower is better. Cloud container, one browser at a time: ungoogled Chromium 156.0.8078.79, Firefox 158.0, WebKitGTK 2.52.6 (2026.11.22). Files: the retail e-commerce table (95,607 rows x 8 columns, Latin-1), the SEC 2026 Q1 numbers file (54,712 rows x 9 columns, tab separated) and the SBA assistance file (3,206 rows x 116 columns, mostly text). Papa Parse 5 gets the decoded text with `header` and `dynamicTyping`; text-columns gets the bytes and returns columns.

| File | text-columns (Chromium / Firefox / WebKitGTK) | Papa Parse (Chromium / Firefox / WebKitGTK) | Papa Parse time / ours |
|---|---|---|---|
| Retail | 165 / 107 / 141 | 261 / 206 / 145 | 1.58 / 1.93 / 1.03 |
| SEC numbers | 29 / 68 / 32 | 143 / 125 / 118 | 4.86 / 1.84 / 3.69 |
| SBA, 116 columns | 74 / 80 / 75 | 113 / 75 / 93 | 1.54 / 0.94 / 1.24 |

Papa Parse and d3-dsv are fuller parsers (type guessing for dates and booleans, streaming, error recovery, other delimiters); text-columns does less on purpose. A wide text-heavy file is close to level, and Firefox is 6% slower than Papa Parse on the SBA file. d3-dsv, the plain-JavaScript path, the WebAssembly share and `toRows()` were measured on generated 200,000-row tables earlier and have not been re-measured on real files; those figures were removed from this page. The harness and raw results are in `tools/real-corpus`.

## Limits
- One-character delimiter below 128 other than a quote or a line break.
- No type guessing by itself beyond plain decimals: dates and booleans are read only when you ask (`types`, since 0.5.0). No streaming.
- Input over about 1.4 GB is not supported.

## Prior art and credits
The idea of finding structural characters with SIMD compares is from simdjson and simdcsv (Langdale, Lemire and others). This module is a small independent implementation in C compiled to WebAssembly; no code was copied. Papa Parse (MIT) and d3-dsv (ISC) were used only as timing comparisons.

## For AI agents
Source of the scanner: `wasm/tc.c`; build with `sh wasm/build.sh`, embed with `python3 wasm/embed.py` (both check modes exist). Checks: `node modules/text-columns/test/run.js`. The two kernels (`scan`, `numcol`) exist twice, in C and in JavaScript, with the same rules; change both.
