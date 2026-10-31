# text-columns changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 0.6.1 · API 0 · 2026-10-31
- Big files with number columns: the page no longer copies them, so it stays responsive (Chromium 42 to 7 ms pause, up to 1.4x faster).

## 0.6.0 · API 0 · 2026-10-31
- New: parseParallel takes a picked file directly; each helper reads its own piece, so the page never holds the whole file (1.0 to 1.75x faster).

## 0.5.2 · API 0 · 2026-10-31
- parseParallel reads files with accented or other non-ASCII text up to 4.8x faster.

## 0.5.1 · API 0 · 2026-10-30
- Parallel parsing now starts at 4 MB once its helpers are running (it was 32 MB), about 0.6 to 0.9x the time on mid-size files.

## 0.5.0 · API 0 · 2026-10-30
- New, opt-in: types option turns YYYY-MM-DD columns into dates (milliseconds) and true/false columns into booleans. Without it nothing changes.

## 0.4.0 · API 0 · 2026-10-30
- New: columns can be a function that says yes or no for each column name. Nothing else changed; same speed.

## 0.3.0 · API 0 · 2026-10-30
- New: `columns` reads only the columns you name; `lazy: true` cuts text strings only when read (or one cell with `get(i)`). Big files with quotes split faster; a 150 MB number file reads up to 3 times faster.

## 0.2.0 · API 0 · 2026-10-30
- New: `parseParallel` reads a big CSV in Web Workers and gives the same table as `parse` (up to 2.9 times as fast on number columns of a 150 MB file). `warm` and `closeHelpers` start and stop the helpers. Files under 32 MB are read directly.

## 0.1.1 · API 0 · 2026-10-27
- toRows() keeps a column named __proto__ as its own data, and a header with a repeated name now throws instead of silently dropping a column. Same speed.

## 0.1.0 · API 0 · 2026-10-26
- First version: reads CSV and TSV into number and text columns with a WebAssembly SIMD scan, 3 to 11 times faster than common parsers.

## 0.1.0 · API 0 · 2026-10-27
- First version: reads CSV and TSV into Float64Array number columns and text columns with a WebAssembly SIMD scan (3 to 11 times faster than common parsers in the container), plain JavaScript fallback with the same answers.
