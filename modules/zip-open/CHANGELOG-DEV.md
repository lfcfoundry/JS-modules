# zip-open developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.11.0 · API 1 · 2026-10-31

### Quick
Excel read inside a helper when the caller passes workers (expandBlob).

### Deep
Excel read inside a helper when the caller passes workers (expandBlob). The whole workbook (parts, WebAssembly sheet reader, CSV) runs in one helper, always the same one so it stays warmed up; a helper that dies falls back to reading on the page. Same files, notes and limits (new test: book job really sent to a helper, a dying helper falls back, limits the same inside a helper). Laptop, 16 cores, helper / 1.10.0 (both with workers: 2), whole open: Firefox 160 200k rows 0.985, 60k 1.000, 6k 1.143 (7 ms sheet, 1 ms timer steps), formulas 1.047, text 1.050; Chromium 156 200k 1.014, 60k 1.177, 6k 0.960, formulas 0.983, text 1.111. Longest page freeze during an open, 1.10.0 -> 1.11.0: Firefox 119 -> 6, 57 -> 5, 7 -> 5, 21 -> 5, 27 -> 5 ms; Chromium 185 -> 6, 52 -> 6, 8 -> 6, 24 -> 6, 29 -> 6 ms. Cloud (4 cores) freeze on an 18 MB sheet: Chromium 408 -> 6, Firefox 342 -> 16, WebKitGTK 218 -> 9 ms. Owner approved shipping despite >5% on some sheets (card, 2026.10.31 7:28 PM ET). Tried and dropped: CSV back as moved bytes, unpacking parts side by side, both stacked.

## 1.10.0 · API 1 · 2026-10-31

### Quick
New WebAssembly Excel reader (wasm/xlsx.c, source and reproducible build shipped) reads sheet and shared-strings bytes straight to CSV, so the big sheet is never decoded to text; anything unusual falls back to the JavaScript reader. Fix: expandBlob helpers were closed by an orphaned idle timer while another open used them. No API change.

### Details
Early-stop A/B, whole expand() 1.10.0 / 1.9.0 (lower is better), cloud: Chromium 155 60k rows 0.365, 6k 0.335, 20k with formulas 0.383, 30k all-text 0.361; Firefox 158 0.300, 0.276, 0.300, 0.340; WebKitGTK 2.52.6 0.405, 0.415, 0.357, 0.521. Falls back for: not the usual shape, not strict UTF-8, UTF-16, inline strings, out-of-order cells, maxRows. Numbers JavaScript prints differently and non-whole dates are finished in JavaScript. One wasm instance reused, let go 5 s after the last workbook. Tests: every xlsx test also through the wasm reader, 8,000 random byte-level sheets in the suite (120,000 offline, 0 differences), helper-close regression test.

### Deep
Excel whole open 1.9 to 3.6 times as fast (48 to 72% less time) than 1.9.0 with a WebAssembly reader on raw bytes (cloud Chromium 155, Firefox 158, WebKitGTK 2.52.6), same output; helper idle-timer hang fixed. Results: js-modules-research/zip-open/RESULTS-xlsx-fast-rows-2026.10.31.md (rounds 7-8).

## 1.9.0 · API 1 · 2026-10-31

### Quick
Row reader reads cell attributes in place (no string per attribute), CSV quoting check by char codes for spaces and non-ASCII text, each shared text made CSV-ready once and numbers/dates never re-checked. Same output; no API change.

### Details
Early-stop A/B, 1.9.0 / 1.8.0 on workbook-to-CSV (lower is better), cloud: Chromium 155 60k rows 0.731, 6k 0.758, 20k with formulas 0.710, 30k all-text 0.937; Firefox 158 0.788, 0.824, 0.809, 0.878; WebKitGTK 2.52.6 0.685, 0.758, 0.873, 0.723. Alone: attributes in place 0.74-0.96, quoting check 0.87-1.03, quote-once 0.82-1.04; stacked beats each. New test: every text up to 4 characters from a 13-character tricky alphabet quoted exactly as the reference rule (inline, shared and formula-string cells).

### Deep
Excel reading 6 to 31% faster than 1.8.0 (cloud Chromium 155, Firefox 158, WebKitGTK 2.52.6), same output: attributes read in place, wider CSV quoting fast path, shared text quoted once. Results: js-modules-research/zip-open/RESULTS-xlsx-fast-rows-2026.10.31.md (round 6).

## 1.8.0 · API 1 · 2026-10-31

### Quick
Fast row reader for the usual <row><c><v> sheet shape, formulas skipped instead of falling back, plain shared strings read directly, whole-day dates worked out without Date; anything else falls back to the general reader. Same output; no API change.

### Details
Early-stop A/B, 1.8.0 / 1.7.0 on workbook-to-CSV (lower is better), cloud: Chromium 155 60k rows 0.334, 6k 0.353, 20k with formulas 0.331, 30k all-text 0.426; Firefox 158 0.394, 0.412, 0.554, 0.420; WebKitGTK 2.52.6 0.383, 0.389, 0.420, 0.304. Dropped after testing: direct CSV line building (WebKitGTK up to 1.41x slower) and a repeated-date memo (Firefox 1.24-1.60x slower). Tests: random-sheet differential (30,000 sheets incl. 9 formula shapes), 20,000 random shared-string lists, every whole-day date serial in both date systems.

### Deep
Excel reading 1.8 to 3.3 times as fast (45 to 70% less time) (cloud Chromium 155, Firefox 158, WebKitGTK 2.52.6; 60k, 6k, formula and all-text sheets), same output. Row reader + formula skip + shared strings + direct dates; per-cell scalars, plain-integer and csvCell fast paths. Results: js-modules-research/zip-open/RESULTS-xlsx-fast-rows-2026.10.31.md.

## 1.7.0 · API 1 · 2026-10-31

### Quick
Faster xlsx sheet XML scanner: quote-position cache, indexOf tag ends, hand-written attribute parser with regex fallback, text decoded only when needed. Same output; no API change.

### Details
Early-stop A/B, 1.7.0 / 1.6.0 (lower is better): laptop Firefox 160 60k rows 0.887 (0.856-0.963), 6k 0.797 (0.732-0.913); laptop Chromium 156 60k 0.762 (0.664-0.902, noisy), 6k 0.767 (0.685-0.778); cloud Chromium 155 0.711, Firefox 158 0.782, WebKitGTK 0.766 at 60k. Differential test of new vs old scanner on 40,000 random XML pieces.

### Deep
Faster Excel sheet scanner: laptop Chromium 23-24% faster, laptop Firefox 11-20% faster, cloud 22-29% faster; same output (40,000-piece differential test).

## 1.6.0 · API 1 · 2026-10-31

### Quick
One shared output buffer for text entries instead of a fresh buffer per entry; released after 5 s idle; concurrent opens never share it. No API change.

### Details
Paired A/B, 1.6.0 / 1.5.2 (lower is better), 12 rounds: laptop Chromium 156 bytes 0.86-0.98, File 0.91-1.02; laptop Firefox 160 (two runs) 0.93-1.00 except 400 small files from bytes 0.94 / 1.15 (ms-scale timings, range 0.84-1.22); cloud Chromium 153 0.82-0.92. Owner's pick: merge 1.6.0, laptop-check the 1.7.0 Excel reader first.

### Deep
Shared reusable output buffer for text entries: laptop Chromium 2-14% faster, laptop Firefox about even (one small-file case 0.94 and 1.15 in two runs), cloud 8-18% faster.

## 1.5.2 · API 1 · 2026-10-31

### Quick
Loading the file costs what it did before 1.5.0, and helpers stop holding memory when idle. No API change.

### Details
inflate.wasm (9.5 KB) split from crc32.wasm (back to 1,476 bytes), compiled the first time a 4 KB-or-smaller entry is opened; 2,000 tiny files still 1.4-1.9x faster than streams (Firefox 158 195 to 101 ms, Chromium 155 153 to 109, WebKitGTK 167 to 122). Helpers from expandBlob({workers}) close 5 s after the last call; idleMs changes it; restarting them cost nothing measurable in 3 browsers.

### Deep
A pre-sized output buffer was tried and dropped (WebKitGTK single 42 MB entry +26%, Firefox small File +23%).

## 1.5.1 · API 1 · 2026-10-30

### Quick
expandBlob without helpers reads a zip of up to 16 MB in one go instead of in pieces: 0.80 to 0.93x the time on a 9 MB zip of 5 CSV files, level with 1.3.1 expand. Bigger zips are still read in pieces, so they never sit whole in memory.

### Details
On the laptop, expandBlob without helpers took 1.13x (Firefox 160) and 1.28x (Chromium 156) the time of 1.3.1 expand on a 9 MB zip; the piece path (Blob slices, stream piped through DecompressionStream) costs more than one arrayBuffer read for a small file. Container, 9 MB zip, medians: Chromium 162 to 130 ms, Firefox 138 to 128, WebKitGTK 162 to 142. Threshold WHOLE_MAX 16 MB; opts._wholeMax (tests only) forces the piece path, and test/run.js now checks pieces and one-go give the same files and notes for every case.

### Deep
zip-open 1.5.1: expandBlob reads zips up to 16 MB in one go when no helpers are asked for. Container 9 MB zip: Chromium 155 162 to 130 ms (0.80), Firefox 158 138 to 128 (0.93), WebKitGTK 162 to 142 (0.88). 1.5.0 expand vs 1.3.1 expand: 0.98, 1.05, 0.99 (noise). Tests 27 pass, with a new pieces-vs-one-go check.

## 1.5.0 · API 1 · 2026-10-30

### Quick
Faster: entries of 4 KB or less (compressed) are unpacked by a small WebAssembly inflate, about 1.5 to 2.2 times as fast for thousands of tiny files. Module grows by 9.4 KB of WebAssembly. Same files, same notes.

### Deep
Wasm inflate for entries of 4 KB or less compressed: 1.5x to 2.2x faster on 2,000 tiny files in Firefox 158, Chromium 155 and WebKitGTK 2.52.6; larger entries unchanged. crc32.wasm rebuilt (10,927 bytes). 27 Node checks. Numbers: /mnt/project-files/js-modules-research/zip-open/RESULTS-tiny-entries-2026.10.30.md.

## 1.4.0 · API 1 · 2026-10-30

### Quick
New: `expandBlob`, `listBlob` and `readBlob` open a File or Blob in pieces, so a big zip never has to sit whole in memory. Same files, same notes. New: `{ workers: n }` unpacks big entries (2 MB and up) side by side in Web Workers: about 1.2 to 1.8 times as fast on a zip of several big files. Off by default. Checks: 700 damaged zips give the same answer from a File as from memory.

### Deep
expandBlob, listBlob and readBlob read a dropped File without holding the whole zip; optional workers for entries of 2 MB and up. Browser numbers (Firefox 158, Chromium 155, WebKitGTK 2.52.6): /mnt/project-files/js-modules-research/zip-open/RESULTS-stream-2026.10.30.md. 26 Node checks; 700 damaged zips give identical results from a File, memory and helpers.

## 1.3.1 · API 1 · 2026-10-26

### Quick
Fixed: a zip comment that contains end-record bytes no longer replaces the real directory; zips with extra bytes after the end record still open.

## 1.3.0 · API 1 · 2026-10-22

### Quick
The WebAssembly checksum now starts compiling in the background when the file loads; adds wasmReady() and wasmModule().

### Deep
Compile early: zip-open.js starts WebAssembly.compile for the 1,476-byte CRC-32 program when the file loads; the first big checksum only starts it. A checksum asked for before the compile is done compiles on the spot as before; with no WebAssembly the plain loop answers as before. New ZipOpen.wasmReady() (promise of true/false) and ZipOpen.wasmModule(). Same answers. Load plus first use, ms, old / new, median of 9 fresh pages, right after load / 250 ms later (bigger ratio is better): Chromium 155 7.4 / 7.3 and 7.7 / 7.7 (1.01x, 1.00x), Firefox 158.0 18 / 20 and 19 / 19 (0.90x, 1.00x), WebKitGTK 2.52.6 4 / 4 and 4 / 4, GNOME Web 46.5 5 / 4 and 8 / 5 (1.25x, 1.60x). A wash except GNOME Web; Firefox right after load was 2 ms slower in one run.

## 1.2.0 · API 1 · 2026-10-18

### Quick
Checking big files is about 1.3 to 1.7 times faster using a small WebAssembly checksum (same answers). Pages with a content policy need 'wasm-unsafe-eval'; without it the old code is used.

### Deep
WebAssembly CRC-32. The checksum that proves every unpacked file is intact now also runs as a 1,476-byte WebAssembly function (slicing by 16) embedded in zip-open.js, used from 1,024 bytes up, with the plain JavaScript loop as the fallback (crc32(bytes, true) forces it; ZipOpen.wasmAvailable() reports it). Time to checksum a 20 MB buffer, median of 3 passes of 7 rounds in rotating order, current JavaScript loop to WebAssembly, ms (lower is better; times faster, higher is better): ungoogled-chromium 155.0.8059.39-1 16.5 to 12.9 (1.28x, range 1.17 to 1.33x); Firefox 158.0 20 to 12 (1.67x, 1.58 to 1.71x); WebKitGTK 2.52.6 15 to 9 (1.67x, 1.67 to 1.88x); GNOME Web 46.5 16 to 10 (1.60x, 1.45 to 1.70x). 4 KB pieces: 1.35x, 1.54x, 1.55x, 1.42x. Same checksums: 1,860 of 1,860 identical in 12 of 12 browser runs, and the same on a page without the wasm permission (plain loop used). Plainly where little changed: pieces under 1,024 bytes use the plain loop (256-byte pieces tie, 0.93 to 1.06x); the first checksum of 1 MB on a fresh page is about the same (2 to 3 ms; in the two WebKit browsers wasm was about 1 ms slower, inside the timer rounding); opening a typical small zip or Excel file gains little because unpacking is the browser's own DecompressionStream. Cost: 27,468 to 31,479 bytes as written, 16,088 to 18,955 minified, 7,056 to 8,159 gzipped (smaller is better). Pages with a Content Security Policy need 'wasm-unsafe-eval' in script-src. Source wasm/crc32.c, rebuild wasm/build.sh, embed wasm/embed.py, both with --check. Not measured: a phone, Safari.

## 1.1.0 · API 1 · 2026-10-17

### Quick
The check on every unpacked file is about 3.9 times faster, so large zips open sooner. Same answers.

### Deep
The checksum check on every unpacked file is about 3.9 times faster: 2.97 to 0.76 ms per MB in Node 22.22, 2.89 to 0.74 in ungoogled Chromium 155 (3.9 times), 3.25 to 0.85 in Firefox 158 (3.8 times), 2.7 to 0.7 in WebKitGTK 2.52.6 and in GNOME Web 46.5 (3.9 times), measured on 20 MB (best of 3). At the 400 MB size limit that is about 1.2 s down to 0.3 s. It uses the 'slicing by 8' method (eight table lookups per eight bytes, reading whole words when the bytes sit on a 4-byte boundary). The answers are exactly the same: 814 checksums (every length 0 to 89 at every start position 0 to 8, 1 MB and 20 MB buffers, the standard test value) gave 0 different from a plain CRC, in Node and in all four browsers. The file grows by about 1.3 KB (26,143 to 27,468 bytes). Nothing else in the module changed.

## 1.0.0 · API 1 · 2026-10-17

### Quick
New module: opens .zip and Excel .xlsx files in the browser or in Node with no libraries, with every problem reported in plain words. Zip bombs are refused quickly.

### Deep
New module, cut from Netflow Map's file opener. It opens .zip and Excel .xlsx files in the browser or in Node, with no libraries: text files come out as text, every sheet comes out as a CSV table, and every problem is a plain-words note. Every limit is counted on the bytes that really come out, not on the sizes the zip claims. Measured in Node on a zip of 1 GB of zeros (0.97 MB on disk) whose header says 1,000 bytes: this module refuses it in about 0.05 s using about 47 MB, while fflate 0.8.3 took 3.8 s and returned a 1,000-byte file with no error. New compared with the Netflow Map original: `read(bytes, entry, limit)` for files that are not text, and a `textExt` option to choose which file endings count as text (before, the list was fixed). The Excel reader is bundled inside, so there is nothing else to include. 14 checks, about 2.6 s.
