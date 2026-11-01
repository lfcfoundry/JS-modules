# zip-open

**Version 1.13.0 · API 1**

**Tested in:** Firefox 158, ungoogled Chromium 155, WebKitGTK 2.52.6

## What it is and how it works

Opens `.zip` and Excel `.xlsx` files safely, in the browser or Node. About 40 KB gzipped (31.6 KB minified and gzipped), no dependencies.

- Text files come out as strings, and every Excel sheet comes out as CSV text.
- Each entry is unpacked with the platform's own deflate and its checksum is checked.
- Limits are counted on the bytes that really come out, so a zip bomb stops at the limit.

## Why it exists

Users drop files on a page, and a zip can claim anything in its header. Common libraries trust those sizes or leave the limits to you. This one turns "it said 1 KB, it was 1 GB" into a plain sentence.

**Where it helps**

- Importing CSV or Excel data from user files.
- Opening zips of many small text files.
- Pages that must not crash on hostile uploads.

**Not for:** creating zips; it only opens them.

## Try it and test it
**Test it:** `node modules/zip-open/test/run.js` (18 checks, including zip bombs, bad checksums, cut-off files, lying offsets and zips inside zips; about 2.6 s). **Try it:** `demo.html` (drop a file, or press the bomb button).

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
Also exported: `isZip`, `looksLikeArchive`, `decodeText` (UTF-8, else Windows-1252), `crc32(bytes)` (WebAssembly from 1,024 bytes up; `crc32(bytes, true)` forces the plain JavaScript loop), `wasmAvailable()` and `LIMITS`.

Needs async functions and, in a browser, `DecompressionStream("deflate-raw")`. In Node it uses `zlib`.

## What it protects you from
Every limit is counted on the bytes that really come out, not on what the zip says about itself, so a zip bomb stops at the limit.
- One text file at most 60 MB, one sheet 150 MB, everything from one drop 400 MB, 5,000 text files, 20,000 listed entries, zips inside zips 3 deep (all changeable with the options above).
- Wrong checksums, cut-off data, sizes that lie, a count of files that lies, offsets that point nowhere, password-protected entries and unusual compression methods are skipped with a note, not thrown.
- Names such as `__proto__` cannot reach an object's inner workings; macOS and editor junk (`__MACOSX`, `.DS_Store`, `.git`) is ignored.
- XML is read by a small scanner that does not load outside files or expand entities beyond the basic five.

## Big files: open a File in pieces, unpack side by side (since 1.4.0)
```js
var r = await ZipOpen.expandBlob(file, file.name);                      // file: a File or Blob; same answer and notes as expand(), but only the end of the file, the directory and the entry being unpacked are read
var r = await ZipOpen.expandBlob(file, file.name, { workers: 4 });      // entries of 2 MB or more unpack in 4 Web Workers at once; ZipOpen.warm(4) starts them early; ZipOpen.closeHelpers() stops them
var toc = await ZipOpen.listBlob(file); var got = await ZipOpen.readBlob(file, toc.entries[0], 5e6);
```
Same limits, same notes, same checksum checks as `expand`; the checksum is worked out while the bytes arrive. Helpers are off unless you ask (`workers`), and they help only when a zip holds several big entries: measured on 5 entries of 16 MB, 4 helpers took 400 / 429 / 478 ms against 784 / 530 / 835 ms in memory (Firefox 158 / Chromium 155 / WebKitGTK 2.52.6; lower is better). Tiny entries and a single entry gain nothing (about 20% slower with helpers), so small ones are never sent. Helpers close 5 s after the last call so they stop holding memory (since 1.5.2; `idleMs` changes the delay), and starting them again cost nothing measurable in Firefox, Chromium or WebKitGTK. Details: `tests/zip-open-stream-browser.html`. With helpers on, an Excel file is read whole inside one helper (since 1.11.0), so the page never stalls on a big sheet: on a laptop a 200,000-row sheet froze the page for 119 to 185 ms before and 6 ms now, for about the same total time (0.96 to 1.18).

## Small entries: inflate in WebAssembly (since 1.5.0)
Entries that are 4 KB or less compressed are unpacked by a 9.5 KB WebAssembly inflate (its own module, compiled the first time a small entry is opened, so page load is unchanged) instead of a browser stream each, because a stream costs more to start than a small entry costs to unpack. 2,000 files of 100 rows (4.7 MB), from bytes, ms, lower is better: Firefox 158 124 against 269, Chromium 155 119 against 189, WebKitGTK 2.52.6 128 against 200 (fflate unzipSync: 124 / 108 / 257). Larger entries still use the browser's stream: at 8 KB and up the WebAssembly inflate was up to 1.5x slower in Chromium and Firefox, so the cutoff is 4 KB. Same files and notes: the WebAssembly inflate matches zlib on 9,000 random valid, damaged and cut streams, and 400 zips compare equal to the stream path. Without WebAssembly the stream is used.

## WebAssembly checksum (since 1.2.0)

**What.** The checksum that proves every unpacked file is intact (CRC-32) also exists as a 1,476-byte WebAssembly function ("slicing by 16"), embedded in `zip-open.js`. `crc32` uses it for 1,024 bytes and more; shorter pieces use the plain JavaScript loop, which is as fast there. `ZipOpen.wasmAvailable()` says whether the browser allows it.

**Why.** On a 20 MB buffer the checksum takes 16.5 to 12.9 ms in ungoogled-chromium 155.0.8059.39-1 (1.28x), 20 to 12 ms in Firefox 158.0 (1.67x), 15 to 9 ms in WebKitGTK 2.52.6 (1.67x) and 16 to 10 ms in GNOME Web 46.5 (1.60x); median of 3 passes of 7 rounds, lower is better. 4 KB pieces gain 1.35x, 1.54x, 1.55x and 1.42x. The answers are identical: 1,860 of 1,860 checksums in 12 of 12 runs, and the same on a page that forbids WebAssembly.

**Rules.**
- Add `'wasm-unsafe-eval'` to `script-src` if your page has a Content Security Policy. Without it, or if anything goes wrong, the plain JavaScript loop gives the same answers.
- `crc32(bytes, true)` always uses the plain loop.
- Source `wasm/crc32.c`, rebuild `wasm/build.sh`, embed `wasm/embed.py`; both have `--check` to prove the committed files match.

**Honest limits.** Most zips and Excel files are small, so opening one gains little: the unpacking itself is the browser's own `DecompressionStream`. Pieces of 256 bytes tie (0.93 to 1.06x) and use the plain loop. The first checksum on a fresh page is about the same (2 to 3 ms for 1 MB; in the two WebKit browsers wasm is about 1 ms slower there, inside the timer's rounding). Costs bytes: +3,011 minified and +1,103 gzipped (16,088 to 18,955 and 7,056 to 8,159; smaller is better). Not run: a phone, Safari.

## Compile early (since 1.3.0)

The checksum program starts compiling in the background when the file loads, so the first big checksum only starts it. `ZipOpen.wasmReady()` gives a promise of `true` or `false` and `ZipOpen.wasmModule()` the compiled module (or `null`). A checksum asked for before the compile is done compiles on the spot, as before; without WebAssembly the plain loop answers. The answers do not change.

Honest numbers: load plus first use, ms, old / new (median of nine fresh pages, right after load; lower is better): Chromium 155 7.4 / 7.3, Firefox 158.0 18 / 20, WebKitGTK 2.52.6 4 / 4, GNOME Web 46.5 5 / 4. A wash, as expected for a 1,476-byte program.

## Numbers (Node 22, measured 2026-10-17)

> **Node numbers.** The speeds in this section were measured in Node, not in the four test browsers (ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5), so they are not what a visitor's browser does. Use them to compare rows with each other, not as page speeds. Sizes and counts are exact; only the times depend on the browser. Re-measuring in the four browsers is not done (open item on `TASKS.md`).

A zip of 1 GB of zeros (0.97 MB on disk) whose header says the file holds 1,000 bytes:

| | result | time | memory |
|---|---|---|---|
| zip-open 1.0.0 | refuses it with a plain-words error: "unpacks to more than it says it does" | about 0.05 s including starting Node | about 47 MB |
| fflate 0.8.3 `unzipSync` | hands back a file of 1,000 bytes with no error | 3.8 s | about 57 MB |

The demo page builds a 64 MB version of this in your browser and opens it: it stops in about 0.5 s in Firefox 158 and ungoogled Chromium 155, including the time to build it.

## How it compares
Smaller than fflate and, of the ones measured, the only one that stops a lying zip by itself. Speed (laptop Firefox 160, 16 cores, 2026.10.30, 400 CSV files in a 2.45 MB zip): 34 ms against 49 for fflate and 66 for JSZip, while checking every checksum and limit. It opens only; it cannot write zips.

| Alternative | Size (smaller is better) | Speed (faster is better) | Features | Where it wins or loses |
|---|---|---|---|---|
| zip-open 1.13.0 (MIT, this module) | 81,700 bytes minified, 32,381 gzipped (116,873 as written, with the Excel reader and helpers; terser 5.51.2; 1.2.0 was 18,955 and 8,159) | Checksum on big buffers 1.3 to 1.7 times faster again with WebAssembly (20 MB: 16.5 to 12.9 ms in Chromium 155, 20 to 12 in Firefox 158, 15 to 9 in WebKitGTK 2.52.6, 16 to 10 in GNOME Web 46.5; lower is better). In 1.1.0 the checksum check was 3.9 times faster than in 1.0.0: 0.74 ms per MB in Chromium 155, 0.85 in Firefox 158, 0.7 in WebKitGTK 2.52.6 and GNOME Web 46.5 (smaller is better). Laptop Firefox 160: 34 ms on 400 CSV files against 49 for fflate and 66 for JSZip | Reads zip and Excel .xlsx, limits counted on the bytes that really come out, plain-words notes | Wins on safety by default and Excel to CSV; loses on writing zips and on formats |
| [fflate](https://github.com/101arrowz/fflate) (MIT, 0.8.3) | 33 KB, 12.6 KB gzipped | Laptop Firefox 160: 49 ms against zip-open's 34 on 400 CSV files | Reads and writes zips and other formats; safety limits are left to you | On the 1 GB-of-zeros test it returned a 1,000-byte file with no error. Wins on features and on writing zips |
| JSZip 3.10.2 (MIT or GPL-3.0-or-later) | 97,591 bytes minified, 28,036 gzipped (whole library, terser 5.51.2 `-c passes=2 -m`) | Laptop Firefox 160: 66 ms against zip-open's 34 on 400 CSV files | Reads and writes zips | Behavior on a lying zip: not measured |
| zip.js | Not measured | Not measured | Reads and writes zips | Behavior on a lying zip: not measured |
| SheetJS | Much larger (not measured) | Not measured | Reads many spreadsheet formats | Wins on formats; this module reads only the cell values of .xlsx |

Memory on the 1 GB-of-zeros zip (Node, smaller is better): about 47 MB here, about 57 MB for fflate.

Where it loses:
- Opens only; it does not create zips.
- Reads deflate and stored entries only; other methods are skipped with a note.
- No formulas calculated, no charts, pictures or macros, no old `.xls`.
- Not a virus scanner.

## Limits
- Opens, does not create. Reads deflate and stored entries; other methods are skipped with a note.
- Zip64 is read for sizes and counts; a zip bigger than the browser can hold in memory cannot be opened (the whole file is a `Uint8Array`).
- Spreadsheets: cell values, shared strings and dates stored with a date format become CSV text. Formulas are not calculated (the saved value is used), and charts, pictures and macros are ignored. Old `.xls` files are not supported.
- Not a security product: it limits memory and time, it does not scan for viruses.

## Prior art and credits
No code from others; the ideas below are theirs. The code is written for this repository (LFC Foundry, MIT). Deflate itself comes from the platform: `DecompressionStream("deflate-raw")` in browsers and `zlib` in Node.
- [fflate](https://github.com/101arrowz/fflate) (MIT, 0.8.3, 33 KB / 12.6 KB gzipped): compared against, not copied. Fast and complete, reads and writes zips and other formats. It leaves safety limits to you (see the table). Use it when you need to write zips or want the speed.
- JSZip 3.10.2 (MIT or GPL-3.0-or-later) and zip.js are the other common choices. Their behavior on a lying zip was not measured here.
- SheetJS reads many spreadsheet formats but is much larger; this module reads only the cell values of `.xlsx`.
- The zip file format (PKWARE's published APPNOTE, including Zip64) and the Excel `.xlsx` file layout (Office Open XML, ECMA-376): the published formats, implemented from scratch.
- CRC-32 "slicing by 8" (eight table lookups per eight bytes): a published method (Intel researchers, 2005), idea only, no code taken.

## For AI agents
Call `expand` on the bytes of anything a user drops, show `notes` to the user, and never rewrite its limits upward to "make a big file work" without telling the user. Use `list` first if you want to show what is inside before reading it.
