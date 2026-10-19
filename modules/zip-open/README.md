# zip-open

**Version 1.2.0 · API 1**

**Tested in:** Node checks (18, 3 of them new: wasm against the plain loop for lengths around the 1,024-byte switch, every start position, the 1 MB chunk edges and a big buffer; without WebAssembly, a refused module and a broken instance; the embedded wasm matches wasm/crc32.c); tests/zip-open-crc-browser.js one browser at a time, 3 passes each, in ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web 46.5: 1,860 checksums, 0 differ in all 12 runs, also on a page without the wasm permission. Not run: a phone, Safari.

Opens `.zip` and Excel `.xlsx` files safely, in the browser or in Node. Text files come out as strings, every Excel sheet comes out as CSV text, and every problem is a note in plain words. About 31 KB (10.7 KB gzipped, of which about 2 KB is the embedded WebAssembly checksum), no dependencies. Cut from Netflow Map's file opener.

It reads the zip's list of entries, then unpacks each text file with the platform's own deflate (`DecompressionStream("deflate-raw")` in browsers, `zlib` in Node) and checks its checksum. Every limit is counted on the bytes that really come out, not on what the zip says about itself, so a zip bomb (a tiny file that claims a small size but unpacks to gigabytes) stops at the limit. An Excel file is a zip of XML files; a small scanner reads the cell values from them and writes each sheet as CSV text.

## Why it exists
Players and users drop files on a page. A zip is a few hundred bytes that can claim anything. The common libraries trust the sizes in the header, or hand you everything and leave the limits to you. This one turns "it said 1 KB, it was 1 GB" into a sentence you can show.

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

## WebAssembly checksum (since 1.2.0)

**What.** The checksum that proves every unpacked file is intact (CRC-32) also exists as a 1,476-byte WebAssembly function ("slicing by 16"), embedded in `zip-open.js`. `crc32` uses it for 1,024 bytes and more; shorter pieces use the plain JavaScript loop, which is as fast there. `ZipOpen.wasmAvailable()` says whether the browser allows it.

**Why.** On a 20 MB buffer the checksum takes 16.5 to 12.9 ms in ungoogled-chromium 155.0.8059.39-1 (1.28x), 20 to 12 ms in Firefox 158.0 (1.67x), 15 to 9 ms in WebKitGTK 2.52.6 (1.67x) and 16 to 10 ms in GNOME Web 46.5 (1.60x); median of 3 passes of 7 rounds, lower is better. 4 KB pieces gain 1.35x, 1.54x, 1.55x and 1.42x. The answers are identical: 1,860 of 1,860 checksums in 12 of 12 runs, and the same on a page that forbids WebAssembly.

**Rules.**
- Add `'wasm-unsafe-eval'` to `script-src` if your page has a Content Security Policy. Without it, or if anything goes wrong, the plain JavaScript loop gives the same answers.
- `crc32(bytes, true)` always uses the plain loop.
- Source `wasm/crc32.c`, rebuild `wasm/build.sh`, embed `wasm/embed.py`; both have `--check` to prove the committed files match.

**Honest limits.** Most zips and Excel files are small, so opening one gains little: the unpacking itself is the browser's own `DecompressionStream`. Pieces of 256 bytes tie (0.93 to 1.06x) and use the plain loop. The first checksum on a fresh page is about the same (2 to 3 ms for 1 MB; in the two WebKit browsers wasm is about 1 ms slower there, inside the timer's rounding). Costs bytes: +3,011 minified and +1,103 gzipped (16,088 to 18,955 and 7,056 to 8,159; smaller is better). Not run: a phone, Safari.

## Numbers (Node 22, measured 2026-10-17)

> **Node numbers.** The speeds in this section were measured in Node, not in the four test browsers (ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5), so they are not what a visitor's browser does. Use them to compare rows with each other, not as page speeds. Sizes and counts are exact; only the times depend on the browser. Re-measuring in the four browsers is not done (open item on `TASKS.md`).

A zip of 1 GB of zeros (0.97 MB on disk) whose header says the file holds 1,000 bytes:

| | result | time | memory |
|---|---|---|---|
| zip-open 1.0.0 | refuses it with a plain-words error: "unpacks to more than it says it does" | about 0.05 s including starting Node | about 47 MB |
| fflate 0.8.3 `unzipSync` | hands back a file of 1,000 bytes with no error | 3.8 s | about 57 MB |

The demo page builds a 64 MB version of this in your browser and opens it: it stops in about 0.5 s in Firefox 158 and ungoogled Chromium 155, including the time to build it.

## How it compares
Smaller than fflate and, of the ones measured, the only one that stops a lying zip by itself. Speed against the others in browsers: not measured. It opens only; it cannot write zips.

| Alternative | Size (smaller is better) | Speed (faster is better) | Features | Where it wins or loses |
|---|---|---|---|---|
| zip-open 1.2.0 (MIT, this module) | 18,955 bytes minified, 8,159 gzipped (31,479 as written; terser 5.51.2; 1.1.0 was 16,088 and 7,056) | Checksum on big buffers 1.3 to 1.7 times faster again with WebAssembly (20 MB: 16.5 to 12.9 ms in Chromium 155, 20 to 12 in Firefox 158, 15 to 9 in WebKitGTK 2.52.6, 16 to 10 in GNOME Web 46.5; lower is better). In 1.1.0 the checksum check was 3.9 times faster than in 1.0.0: 0.74 ms per MB in Chromium 155, 0.85 in Firefox 158, 0.7 in WebKitGTK 2.52.6 and GNOME Web 46.5 (smaller is better). Against the others in browsers: not measured | Reads zip and Excel .xlsx, limits counted on the bytes that really come out, plain-words notes | Wins on safety by default and Excel to CSV; loses on writing zips and on formats |
| [fflate](https://github.com/101arrowz/fflate) (MIT, 0.8.3) | 33 KB, 12.6 KB gzipped | In browsers: not measured | Reads and writes zips and other formats; safety limits are left to you | On the 1 GB-of-zeros test it returned a 1,000-byte file with no error. Wins on features and on writing zips |
| JSZip 3.10.2 (MIT or GPL-3.0-or-later) | Not measured | Not measured | Reads and writes zips | Behavior on a lying zip: not measured |
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
