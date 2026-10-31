# text-columns developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

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
