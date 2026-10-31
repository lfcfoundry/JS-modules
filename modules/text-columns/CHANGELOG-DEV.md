# text-columns developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 0.6.3 · API 0 · 2026-10-31

### Quick
After a parse, repeats in low-variety text columns are merged in ~4 ms idle slices; parse speed unchanged; _shareLater:false skips it.

### Details
Owner's pick (share later, in idle time). Per text column: first 2,048 rows decide (at most 1 different value per 8 rows), at most 4,096 values kept, Map by value, requestIdleCallback (timeout 500 ms) else setTimeout, 4 ms slices checked every 256 rows. Helpers skip it. 16 MB CSV, Chromium kept heap 29.4 to 10.9 MB (repeating) and 25.6 to 15.0 MB (mixed); parse within noise in all 3 browsers; merge done after 35-163 ms (Firefox, WebKitGTK) and 0.6-1.1 s of idle time (Chromium); longest gap 5-9 ms (one WebKitGTK run 15 ms). Inline sharing during the parse was 30-56% slower and was dropped.

### Deep
Repeated text values merged in idle time after a parse: 42-63% less memory kept.

## 0.6.2 · API 0 · 2026-10-31

### Quick
No more long freezes while a big text file turns into strings.

### Details
fillSliced builds strings in steps aiming at 1.5 ms, yielding through a MessageChannel when 4 ms have passed (_sliceBuild:false = old way, _budget = ms); 8 and 16 ms budgets gave longer stalls and no faster totals. Number scratch = 8 bytes x rows (_numRoom:'fields' = old). idleTrim(ms): when over 16 MB, a fresh WebAssembly instance replaces the grown one after ms quiet, in the page and the helpers.

### Deep
the read probe (look once whether reading stalls the page, then read in 1 MB slices) was built and struck: the stall it targeted is the string build, and it cost up to 16% on number files. Windows (later the same day): parse() reads inputs of 8 MB or more in about 4 MB pieces cut after a line end outside quote marks, so the scanner's memory stays near 10 MB; a column that is numbers in one piece and text in another is read again as text there (same answers). Helpers window their own range. The first build searched for quote marks from each cut to the end of the file (slow on files without quotes); it now searches once. 45 MB: back to back and after idle within noise of 0.6.1 in 3 browsers. A 16 MB reserve after idle trim was tested too: no faster than trimming to zero on files over 16 MB, and windows make the trim unneeded.

## 0.6.1 · API 0 · 2026-10-31

### Quick
parseParallel: the helpers join the number columns, so the page no longer copies them (no new options). Against 0.6.0 with a picked file: Chromium 1.17 to 1.41x and its longest page stall 42 to 7 ms on a 45 MB number file; Firefox 0.97 to 1.17x; WebKitGTK 0.94 to 0.99x.

### Details
Round 6, idea C2. Helpers keep their number columns (op 'parse'/'read' with join); the page makes one zero-filled ArrayBuffer per number column (total rows x 8 bytes), splits the columns into one group per helper and runs one turn per helper: at each turn every helper gets a different group (moved, not copied), copies its rows in at its row offset and hands the group back. After the last turn the page wraps the buffers as the Float64Array columns. A helper that fails sends the call to parse() as before. Private switch `_join: false` = 0.6.0's page-side join. Also in the code, off by default: `_slice` (bytes) makes helpers read their range in slices (round 6 idea D, on a card). tests/text-columns-file-browser.js: 576 same-answer cases per browser (adds _join: false and 4 KB slices); times for 0.5.2, 0.6.0, C2 alone (bytes in), 0.6.1, and D stacked, 5 rounds, then 11 rounds of 0.6.0 vs 0.6.1 in Firefox and WebKitGTK.

### Deep
Wall ms 0.6.0 / 0.6.1 (longest stall): Chromium numbers 164/140 (42/7), mixed 227/161 (132/69), accented 263/223 (96/48); Firefox (11 rounds) numbers 120/103 (37/8), mixed 133/133 (98/85), accented 236/243 (142/138); WebKitGTK (11 rounds) numbers 135/140 (22/16), mixed 128/133 (61/59), accented 177/189 (52/50). C2 alone (bytes in, no File): mixed text Chromium 1.43x, else 0.21 to 0.95x; it needs A (helpers read the file) to pay off, as round 6 predicted. D (4 MB / 1 MB slices) stacked on 0.6.1: Chromium 0.69 to 1.14x of 0.6.0 (always slower than 0.6.1), Firefox 0.78 to 1.02x, WebKitGTK 0.81 to 1.01x, stall gains of 1 to 12 ms in WebKitGTK; from an in-memory Blob here, so the picked-file effect research saw is not reproduced on this machine.

## 0.6.0 · API 0 · 2026-10-31

### Quick
New: parseParallel takes a File or Blob (a picked file); each helper reads its own piece, so the page never holds the whole file. Old code is unaffected. Against 0.5.2 with a picked file: Chromium 1.11 to 1.21x, Firefox 1.01 to 1.27x, WebKitGTK 1.63 to 1.75x.

### Details
Round 5 pool study, idea A, stacked with 0.5.2's one-string text (idea B); the owner picked "Add File input" on its card. Each helper gets the Blob (posting a File does not copy it) and a byte range [a, b): it reads from a - 1 to past b, starts after the first line end at or after a - 1 (or at 0 after a byte order mark) and ends after the first line end at or after b - 1, so neighbors meet exactly; it widens the read 4x until it finds that line end. Quotes are checked after the parse (each helper counts its piece's quote marks, the page checks parity at every cut and at the end); a file whose cuts fall inside quotes is read again the 0.5.2 way. A piece whose text the page still has to cut (plain-ASCII text, or bytes that are not UTF-8) sends its bytes back, moved not copied; a column that is numbers in one piece and text in another is asked again with those bytes moved back to the helper and returned. `columns` by name reads the names from the first megabyte. Small files (under minBytes), no workers or an unusual delimiter: the page reads the file and goes the old way. Private switch `_file: false` = the 0.5.2 way. tests/text-columns-file-browser.js: 384 same-answer cases per browser (16 files x 6 option sets x 4 helper settings); then a 45 MB numbers file and 32 MB mixed and accented files as Blobs, 5 rounds, wall ms, page ms and the longest stall (1 ms timer).

### Deep
Wall ms, 0.5.1 way / A alone / B alone (0.5.2) / A + B (0.6.0): Chromium numbers 203/175/213/192, mixed 219/227/272/233, accented 1,143/1,209/343/282; Firefox numbers 177/136/199/159, mixed 217/156/202/159, accented 326/258/221/218; WebKitGTK numbers 226/143/252/150, mixed 229/144/268/153, accented 512/476/350/215. A alone is the fastest on numbers and mixed text in two browsers (B costs a little there), but only A + B fixes accented text, so they ship stacked. Page ms with A + B: 17 to 142 (0.5.2: 108 to 240). Longest stall with A + B: Chromium 41/146/73 ms, Firefox 35/118/83, WebKitGTK 24/68/48 (0.5.2: 78/168/123, 45/123/100, 66/87/58). Two bugs found by the new test before release: a piece read near the end of the file took the rest of the file as its own, and a piece's bytes could be lost on the number/text re-ask. Next (round 6): helpers join the number columns themselves (C2) and read in slices for WebKitGTK (D).

## 0.5.2 · API 0 · 2026-10-31

### Quick
parseParallel: helpers send a non-ASCII piece's text as one string plus positions; same answers, no new options. 32 MB accented: Chromium 4.8x, WebKitGTK 2.1x, Firefox even.

### Details
Round 5 pool study, idea B. Before, a helper built every string of a non-ASCII text column itself (each field decoded on its own) and the page copied millions of strings on arrival; in Chromium that made helpers slower than one thread (1,027 vs 739 ms). Now the helper asks parse for field positions in every text column (_off 2), decodes the piece once with a strict decoder (ignoreBOM, so positions stay exact), turns byte positions into UTF-16 positions in one pass per column (toUnits), and sends the text and positions; the page cuts substrings (the type-2 path that ASCII pieces already used). A piece that is not valid UTF-8 keeps byte positions. Plain-ASCII pieces keep the 0.5.1 way: sending their text from the helper measured 0.82x in Chromium. tests/text-columns-utf16-browser.js: 56 same-answer cases; wall and page ms, 7 to 13 rounds. Numbers 45 MB and plain mixed 32 MB: 0.97 to 1.09x (noise; same code path).

### Deep
Round 5 brief item 1 (idea B only). Idea A (helpers read their own piece from a File/Blob) needs a new input and is on the owner's card. Firefox accented: wall even (253 to 248 ms) but the page's own work grows 46 to 156 ms (substring cuts from one two-byte string); flagged in the card text.

## 0.5.1 · API 0 · 2026-10-30

### Quick
parseParallel default floor: 4,000,000 bytes when the helper pool already has enough helpers (warm() or an earlier call), else 32,000,000 as before. Warm, 4-16 MB: Firefox 0.58-0.99x, WebKitGTK 0.66-1.03x, Chromium 0.62-0.87x (one 1.23x). Cold first calls stay serial because starting helpers costs 30-130 ms (1.0-13x a serial parse at these sizes).

### Details
The owner chose 'Lower to 4 MB' on a card after the laptop measured 0.83x (Firefox 160) and 0.93x (Chromium 156) at 7.8 MB with helpers running. The container check showed a cold first call at 4-16 MB takes 1.0 to 13x the serial time, so the lower floor applies only once the helpers run; explicit minBytes still wins. Same answers: 387-file agreement test, 14 module checks, wasm/plain agreement in 3 browsers.

### Deep
text-columns 0.5.1: warm floor 4 MB. Container, 3 kinds (mixed, numeric, text-heavy) at 2/4/8/16 MB, medians of 7, parallel warm / serial: Chromium 0.83,0.81,1.23,0.77 | 1.03,0.86,0.85,0.75 | 1.01,1.10,0.87,0.62; Firefox 0.83,0.84,0.99,0.76 | 0.86,0.67,0.59,0.58 | 0.74,1.00,0.85,0.66; WebKitGTK 0.86,0.70,0.80,0.91 | 0.86,0.87,0.66,0.70 | 0.90,1.00,1.03,0.92. Cold first call / serial 1.0 to 13.6.

## 0.5.0 · API 0 · 2026-10-30

### Quick
New, opt-in: types option turns YYYY-MM-DD columns into dates (milliseconds) and true/false columns into booleans. Without it nothing changes.

### Deep
text-columns 0.5.0: types option (date, boolean), applied after parse and parseParallel; default output unchanged; not re-timed in browsers because default paths are untouched.

## 0.4.0 · API 0 · 2026-10-30

### Quick
New: columns can be a function that says yes or no for each column name. Nothing else changed; same speed.

### Deep
text-columns 0.4.0: columns accepts a function (name, index) -> bool; resolved on the main thread for parseParallel. No change to default paths. Numcol rewrite tried and dropped (no gain).

## 0.3.0 · API 0 · 2026-10-30

### Quick
New: `columns` reads only the columns you name; `lazy: true` cuts text strings only when read (or one cell with `get(i)`). Big files with quotes split faster; a 150 MB number file reads up to 3 times faster.

### Deep
text-columns 0.3.0: columns option, lazy text columns with get(i), wasm qscan (quote count in helpers), wasm gather, header decoded alone. Output identical to parse. See text-columns/RESULTS-lazy-2026.10.30.md

## 0.2.0 · API 0 · 2026-10-30

### Quick
New: `parseParallel` reads a big CSV in Web Workers and gives the same table as `parse` (up to 2.9 times as fast on number columns of a 150 MB file). `warm` and `closeHelpers` start and stop the helpers. Files under 32 MB are read directly.

### Deep
parseParallel, warm and closeHelpers: helpers scan the text on other threads (default from 32 MB); output identical to parse. Numbers: /mnt/project-files/js-modules-research/text-columns/RESULTS-parallel-2026.10.30.md. Node: 387 random files identical to serial.

## 0.1.1 · API 0 · 2026-10-27

### Quick
toRows() keeps a column named __proto__ as its own data, and a header with a repeated name now throws instead of silently dropping a column. Same speed.

## 0.1.0 · API 0 · 2026-10-26

### Quick
First version: reads CSV and TSV into Float64Array number columns and text columns with a WebAssembly SIMD scan (3 to 11 times faster than common parsers in the container), plain JavaScript fallback with the same answers.

### Deep
Importer built from round 1 queue item (placeholder fast-text-split, name chosen by the owner: text-columns). 200k rows x 6 columns 7.4 MB, container, unguarded: columns out 48/38/39 ms (Firefox/Chromium/WebKitGTK), d3-dsv 213/192/234, Papa Parse 339/440/382.

## 0.1.0 · API 0 · 2026-10-27

### Quick
First version: reads CSV and TSV into Float64Array number columns and text columns with a WebAssembly SIMD scan (3 to 11 times faster than common parsers in the container), plain JavaScript fallback with the same answers.

### Deep
Importer built from round 1 queue item (placeholder fast-text-split, name chosen by the owner: text-columns). 200k rows x 6 columns 7.4 MB, container, unguarded: columns out 48/38/39 ms (Firefox/Chromium/WebKitGTK), d3-dsv 213/192/234, Papa Parse 339/440/382.
