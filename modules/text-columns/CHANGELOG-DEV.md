# text-columns developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

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
