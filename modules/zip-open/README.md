# zip-open

**Version 1.0.0 · API 1**

Opens `.zip` and Excel `.xlsx` files safely, in the browser or in Node. Text files come out as strings, every Excel sheet comes out as CSV text, and every problem is a note in plain words. About 26 KB (9.0 KB gzipped), no dependencies. Cut from Net Flow Map's file opener.

**Test it:** `node modules/zip-open/test/run.js` (14 checks, including zip bombs, bad checksums, cut-off files, lying offsets and zips inside zips; about 2.6 s). **Try it:** `demo.html` (drop a file, or press the bomb button).

## Use
```js
var r = await ZipOpen.expand(bytes, "data.zip");     // bytes: Uint8Array from file.arrayBuffer()
r.files;   // [{ name, path, text }]  text files, and each Excel sheet as its own .csv
r.notes;   // ["\"big.csv\" unpacks to more than it says it does; skipped.", ...] plain words, safe to show
```
`expand` throws a plain-words error when the file is not a zip or when nothing readable is inside. Files that are not text (pictures, programs) are left alone and counted in a note.

For more control:
```js
var toc = ZipOpen.list(bytes);                          // every entry, nothing unpacked: { entries: [{ path, method, crc, csize, usize, ... }] }
var got = await ZipOpen.read(bytes, toc.entries[0], 5e6);   // { bytes } or { skip: "why" }; the third argument is the most bytes you accept
await ZipOpen.expand(bytes, "x.zip", { maxFiles: 100, textExt: /\.(csv|txt)$/i });   // change the limits or what counts as text
```
Also exported: `isZip`, `looksLikeArchive`, `decodeText` (UTF-8, else Windows-1252), `crc32` and `LIMITS`.

Needs async functions and, in a browser, `DecompressionStream("deflate-raw")`. In Node it uses `zlib`.

## What it protects you from
Every limit is counted on the bytes that really come out, not on what the zip says about itself, so a zip bomb stops at the limit.
- One text file at most 60 MB, one sheet 150 MB, everything from one drop 400 MB, 5,000 text files, 20,000 listed entries, zips inside zips 3 deep (all changeable with the options above).
- Wrong checksums, cut-off data, sizes that lie, a count of files that lies, offsets that point nowhere, password-protected entries and unusual compression methods are skipped with a note, not thrown.
- Names such as `__proto__` cannot reach an object's inner workings; macOS and editor junk (`__MACOSX`, `.DS_Store`, `.git`) is ignored.
- XML is read by a small scanner that does not load outside files or expand entities beyond the basic five.

## Numbers (Node 22, measured 2026-10-17)
A zip of 1 GB of zeros (0.97 MB on disk) whose header says the file holds 1,000 bytes:

| | result | time | memory |
|---|---|---|---|
| zip-open 1.0.0 | refuses it with a plain-words error: "unpacks to more than it says it does" | about 0.05 s including starting Node | about 47 MB |
| fflate 0.8.3 `unzipSync` | hands back a file of 1,000 bytes with no error | 3.8 s | about 57 MB |

The demo page builds a 64 MB version of this in your browser and opens it: it stops in about 0.5 s in Firefox 158 and ungoogled Chromium 155, including the time to build it.

## Why
Players and users drop files on a page. A zip is a few hundred bytes that can claim anything. The common libraries trust the sizes in the header, or hand you everything and leave the limits to you. This one turns "it said 1 KB, it was 1 GB" into a sentence you can show.

## Limits
- Opens, does not create. Reads deflate and stored entries; other methods are skipped with a note.
- Zip64 is read for sizes and counts; a zip bigger than the browser can hold in memory cannot be opened (the whole file is a `Uint8Array`).
- Spreadsheets: cell values, shared strings and dates stored with a date format become CSV text. Formulas are not calculated (the saved value is used), and charts, pictures and macros are ignored. Old `.xls` files are not supported.
- Not a security product: it limits memory and time, it does not scan for viruses.

## Prior art
- [fflate](https://github.com/101arrowz/fflate) (MIT, 0.8.3, 33 KB / 12.6 KB gzipped): fast and complete, reads and writes zips and other formats. It leaves safety limits to you (see the table). Use it when you need to write zips or want the speed.
- JSZip 3.10.2 (MIT or GPL-3.0-or-later) and zip.js are the other common choices. Their behavior on a lying zip was not measured here.
- SheetJS reads many spreadsheet formats but is much larger; this module reads only the cell values of `.xlsx`.

## For AI agents
Call `expand` on the bytes of anything a user drops, show `notes` to the user, and never rewrite its limits upward to "make a big file work" without telling the user. Use `list` first if you want to show what is inside before reading it.
